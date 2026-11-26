<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpException;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/**
 * Seating allotment Excel: template (pre-filled with the cycle's current seating) and import.
 * One row per room / class of one date + session. Importing replaces the seating of every
 * date + session that appears in the file; other sessions are left as they are, so the Exam Cell
 * can upload day by day.
 */
class SeatingService
{
    public const HEADERS = ['Date', 'Session', 'Room / Class', 'Students'];
    /** Optional 5th column: papers written in the room, printed on the duty letters. */
    public const COURSES_HEADER = 'Course Codes';
    private const MAX_ROWS = 5000;
    private const MAX_SIZE = 5 * 1024 * 1024;

    private static function header(Worksheet $sheet, array $headers, array $widths): void
    {
        foreach ($headers as $i => $h) {
            $sheet->setCellValue([$i + 1, 1], $h);
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($widths[$i]);
        }
        $last = $sheet->getHighestColumn();
        $sheet->getStyle("A1:{$last}1")->applyFromArray([
            'font' => ['bold' => true, 'color' => ['argb' => 'FFFFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FF1E3A8A']],
        ]);
        $sheet->freezePane('A2');
    }

    public static function template(int $cycleId): Spreadsheet
    {
        $cycle = DutyService::cycle($cycleId);
        $roster = DutyService::roster($cycleId);
        $slots = DutyService::examSlots($cycleId);
        $labels = array_values(array_unique(array_column($slots, 'time_slot_label')));

        $wb = new Spreadsheet();
        $wb->getDefaultStyle()->getFont()->setName('Arial')->setSize(10);
        $sheet = $wb->getActiveSheet();
        $sheet->setTitle('Seating');
        self::header($sheet, [...self::HEADERS, self::COURSES_HEADER], [14, 18, 28, 12, 40]);
        $sheet->getStyle('A2:A' . (self::MAX_ROWS + 1))->getNumberFormat()->setFormatCode('@');

        $r = 2;
        foreach (DutyService::seatingRows($cycleId) as $row) {
            $sheet->setCellValueExplicit("A{$r}", ddmmyyyy($row['exam_date']), DataType::TYPE_STRING);
            $sheet->setCellValue("B{$r}", $row['time_slot_label']);
            $sheet->setCellValueExplicit("C{$r}", $row['room'], DataType::TYPE_STRING);
            $sheet->setCellValue("D{$r}", (int) $row['students']);
            $sheet->setCellValueExplicit("E{$r}", (string) $row['course_codes'], DataType::TYPE_STRING);
            $r++;
        }

        $lists = $wb->createSheet();
        $lists->setTitle('Lists');
        $lists->setSheetState(Worksheet::SHEETSTATE_HIDDEN);
        foreach ($labels as $i => $label) {
            $lists->setCellValue('A' . ($i + 1), $label);
        }
        $last = max(1, count($labels));
        $dvRange = 'B2:B' . max(1001, $r + 500);
        $dv = $sheet->getCell('B2')->getDataValidation();
        $dv->setType(DataValidation::TYPE_LIST);
        $dv->setAllowBlank(true);
        $dv->setShowDropDown(true); // PhpSpreadsheet inverts this: true = arrow visible
        $dv->setShowErrorMessage(true);
        $dv->setError('Pick the session from the list.');
        $dv->setFormula1("Lists!\$A\$1:\$A\${$last}");
        $dv->setSqref($dvRange);
        $dv = $sheet->getCell('D2')->getDataValidation();
        $dv->setType(DataValidation::TYPE_WHOLE);
        $dv->setOperator(DataValidation::OPERATOR_BETWEEN);
        $dv->setAllowBlank(true);
        $dv->setShowErrorMessage(true);
        $dv->setError('Students must be a whole number from 1 to ' . DutyService::ROOM_STUDENTS_MAX . '.');
        $dv->setFormula1('1');
        $dv->setFormula2((string) DutyService::ROOM_STUDENTS_MAX);
        $dv->setSqref('D2:D' . max(1001, $r + 500));

        // Reference: every exam session of the cycle with its student total, to check the seating against.
        $ref = $wb->createSheet();
        $ref->setTitle('Exam Sessions');
        self::header($ref, ['Date', 'Day', 'Session', 'Papers', 'Students'], [14, 12, 18, 10, 12]);
        $r = 2;
        foreach ($slots as $s) {
            $ref->fromArray([ddmmyyyy($s['exam_date']), weekday_of($s['exam_date']), $s['time_slot_label'], $s['paper_count'], $s['total_students']], null, "A{$r}", true);
            $r++;
        }

        $notes = $wb->createSheet();
        $notes->setTitle('Instructions');
        $notes->getColumnDimension('A')->setWidth(110);
        foreach ([
            'Seating allotment for ' . $cycle['title'] . ' - ' . $cycle['month_year'] . '. One row per room / class of one date and session.',
            'Date: DD-MM-YYYY, e.g. 07-12-2026 (YYYY-MM-DD and real Excel dates are accepted too).',
            'Session: pick from the dropdown (must match a time slot that has exams on that date - see the "Exam Sessions" sheet).',
            'Room / Class: room or class name as it should appear on the duty chart, up to ' . DutyService::ROOM_NAME_MAX . ' characters, unique within a session.',
            'Students: number of students seated in that room for that session (1-' . DutyService::ROOM_STUDENTS_MAX . ').',
            'Course Codes (optional): the papers written in that room, comma separated, e.g. "BVOB3G004T, UCSE0O001T". They must be papers of that date and session; the duty letters print their code and name.',
            "Teachers per room: up to {$roster['room_threshold']} students -> {$roster['per_room_small']}, more than {$roster['room_threshold']} -> {$roster['per_room_large']} (change in Rotation settings).",
            'Uploading replaces the seating of every date + session in the file. Sessions not in the file keep their current seating, so you can upload one day at a time.',
            'This file starts with the seating already saved, so you can edit it and upload it again.',
        ] as $i => $line) {
            $notes->setCellValue('A' . ($i + 1), $line);
        }
        $wb->setActiveSheetIndex(0);
        return $wb;
    }

    private static function parseDate(mixed $raw): ?string
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (is_int($raw) || is_float($raw) || (is_string($raw) && is_numeric($raw) && (float) $raw > 20000)) {
            try {
                return ExcelDate::excelToDateTimeObject((float) $raw)->format('Y-m-d');
            } catch (\Throwable) {
                return null;
            }
        }
        $text = trim((string) $raw);
        foreach (['!d-m-Y', '!d/m/Y', '!d.m.Y', '!Y-m-d', '!j-n-Y', '!j/n/Y'] as $fmt) {
            $d = \DateTimeImmutable::createFromFormat($fmt, $text);
            if ($d && $d->format(ltrim($fmt, '!')) === $text) {
                return $d->format('Y-m-d');
            }
        }
        return null;
    }

    private static function sessionKey(string $label): string
    {
        return strtolower((string) preg_replace('/\s+/', '', $label));
    }

    /**
     * @return array{slots:int, rooms:int, students:int, mismatches:array, saved:bool}
     */
    public static function import(int $cycleId, array $file, bool $dryRun): array
    {
        if (empty($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'No file uploaded', ['rows' => []]);
        }
        if ($file['size'] > self::MAX_SIZE) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'File exceeds the 5 MB limit', ['rows' => []]);
        }
        $ext = strtolower((string) pathinfo($file['name'], PATHINFO_EXTENSION));
        if ($ext !== 'xlsx' || file_get_contents($file['tmp_name'], false, null, 0, 2) !== 'PK') {
            throw new HttpException(422, 'UPLOAD_INVALID', 'Upload the seating template as an .xlsx file', ['rows' => []]);
        }
        try {
            $reader = IOFactory::createReader('Xlsx');
            $reader->setReadDataOnly(true);
            $sheet = $reader->load($file['tmp_name'])->getSheet(0);
        } catch (\Throwable) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'Could not read the uploaded file', ['rows' => []]);
        }
        foreach (self::HEADERS as $i => $h) {
            if (strcasecmp(trim((string) $sheet->getCell([$i + 1, 1])->getValue()), $h) !== 0) {
                throw new HttpException(422, 'UPLOAD_INVALID', 'Header row does not match the template', [
                    'rows' => [['row' => 1, 'field' => 'header', 'message' => 'Expected columns: ' . implode(', ', self::HEADERS)]],
                ]);
            }
        }

        $hasCourses = strcasecmp(trim((string) $sheet->getCell([5, 1])->getValue()), self::COURSES_HEADER) === 0;
        $slots = DutyService::examSlots($cycleId);
        $slotIds = [];
        foreach (Db::conn()->query('SELECT id, label FROM time_slots')->fetchAll() as $t) {
            $slotIds[self::sessionKey($t['label'])] = (int) $t['id'];
        }

        $errors = [];
        $groups = [];
        $seen = [];
        $highest = min($sheet->getHighestDataRow(), self::MAX_ROWS + 1);
        for ($r = 2; $r <= $highest; $r++) {
            $rawDate = $sheet->getCell([1, $r])->getValue();
            $session = trim((string) $sheet->getCell([2, $r])->getValue());
            $room = trim((string) preg_replace('/\s+/u', ' ', (string) $sheet->getCell([3, $r])->getValue()));
            $rawStudents = $sheet->getCell([4, $r])->getValue();
            $codes = $hasCourses ? trim((string) $sheet->getCell([5, $r])->getValue()) : '';
            if (($rawDate === null || $rawDate === '') && $session === '' && $room === '' && ($rawStudents === null || $rawStudents === '')) {
                continue;
            }
            $date = self::parseDate($rawDate);
            $slotId = $slotIds[self::sessionKey($session)] ?? null;
            $students = is_numeric($rawStudents) && (float) $rawStudents == (int) $rawStudents ? (int) $rawStudents : null;
            $bad = false;
            if ($date === null) {
                $errors[] = ['row' => $r, 'field' => 'date', 'message' => 'Date must be DD-MM-YYYY'];
                $bad = true;
            }
            if ($slotId === null) {
                $errors[] = ['row' => $r, 'field' => 'session', 'message' => "Unknown session \"{$session}\""];
                $bad = true;
            }
            if ($room === '' || mb_strlen($room) > DutyService::ROOM_NAME_MAX) {
                $errors[] = ['row' => $r, 'field' => 'room', 'message' => 'Room / Class is required (max ' . DutyService::ROOM_NAME_MAX . ' characters)'];
                $bad = true;
            }
            if ($students === null || $students < 1 || $students > DutyService::ROOM_STUDENTS_MAX) {
                $errors[] = ['row' => $r, 'field' => 'students', 'message' => 'Students must be a whole number from 1 to ' . DutyService::ROOM_STUDENTS_MAX];
                $bad = true;
            }
            if ($bad) {
                continue;
            }
            $k = $date . '|' . $slotId;
            if (!isset($slots[$k])) {
                $errors[] = ['row' => $r, 'field' => 'session', 'message' => 'No exams on ' . ddmmyyyy($date) . " in session {$session}"];
                continue;
            }
            $dupKey = $k . '|' . mb_strtolower($room);
            if (isset($seen[$dupKey])) {
                $errors[] = ['row' => $r, 'field' => 'room', 'message' => "Room \"{$room}\" is already listed for this date and session (row {$seen[$dupKey]})"];
                continue;
            }
            $seen[$dupKey] = $r;
            $groups[$k] ??= ['exam_date' => $date, 'time_slot_id' => $slotId, 'rooms' => []];
            $groups[$k]['rooms'][] = [$room, $students, $codes];
        }
        if ($sheet->getHighestDataRow() > self::MAX_ROWS + 1) {
            $errors[] = ['row' => self::MAX_ROWS + 2, 'field' => 'file', 'message' => 'Too many rows (max ' . self::MAX_ROWS . ')'];
        }
        if ($errors) {
            throw new HttpException(422, 'UPLOAD_INVALID', count($errors) . ' row(s) failed validation', ['rows' => $errors]);
        }
        if (!$groups) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'No seating rows found', ['rows' => [['row' => 2, 'field' => 'file', 'message' => 'File has no data rows']]]);
        }

        // Seated vs. registered students per session: reported, not blocking (absentees, shared rooms...).
        $mismatches = [];
        $rooms = 0;
        $students = 0;
        foreach ($groups as $k => $g) {
            $seated = array_sum(array_column($g['rooms'], 1));
            $rooms += count($g['rooms']);
            $students += $seated;
            if ($seated !== $slots[$k]['total_students']) {
                $mismatches[] = ['exam_date' => $g['exam_date'], 'time_slot_label' => $slots[$k]['time_slot_label'],
                    'seated' => $seated, 'registered' => $slots[$k]['total_students']];
            }
        }
        // Course codes must be papers of that date + session (checked here so a dry run reports them per row).
        if ($hasCourses) {
            $known = [];
            $stmt = Db::conn()->prepare('SELECT exam_date, time_slot_id, UPPER(course_code) AS code FROM exam_entries WHERE exam_cycle_id = :c');
            $stmt->execute(['c' => $cycleId]);
            foreach ($stmt->fetchAll() as $e) {
                $known[$e['exam_date'] . '|' . $e['time_slot_id']][$e['code']] = true;
            }
            foreach ($groups as $k => $g) {
                foreach ($g['rooms'] as [$room, , $codes]) {
                    $bad = array_filter(DutyService::splitCodes($codes), fn ($c) => !isset($known[$k][$c]));
                    if ($bad) {
                        $errors[] = ['row' => $seen[$k . '|' . mb_strtolower($room)], 'field' => 'course_codes',
                            'message' => 'No paper ' . implode(', ', $bad) . ' on ' . ddmmyyyy($g['exam_date']) . ' in this session'];
                    }
                }
            }
            if ($errors) {
                throw new HttpException(422, 'UPLOAD_INVALID', count($errors) . ' row(s) failed validation', ['rows' => $errors]);
            }
        }
        if (!$dryRun) {
            DutyService::replaceSeating($cycleId, array_values($groups));
        }
        return ['slots' => count($groups), 'rooms' => $rooms, 'students' => $students, 'mismatches' => $mismatches, 'saved' => !$dryRun];
    }
}
