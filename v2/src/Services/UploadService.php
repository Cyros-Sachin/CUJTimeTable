<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpException;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\IOFactory;
use PhpOffice\PhpSpreadsheet\Cell\Cell;

class UploadService
{
    private const REQUIRED_HEADERS = ['Program', 'Semester', 'Subject Type', 'Date', 'Time Slot', 'Course Code', 'Course Name', 'No. of Students'];
    private const COURSE_CODE_REGEX = '/^[A-Z0-9][A-Z0-9\-_\/ ]{2,29}$/';
    private const MAX_ROWS = 1000;
    private const MAX_SIZE = 5 * 1024 * 1024;

    private static function cellText(?Cell $cell): string
    {
        if ($cell === null) {
            return '';
        }
        $value = $cell->getCalculatedValue();
        return is_string($value) ? trim($value) : trim((string) $value);
    }

    private static function cellIsoDate(?Cell $cell): ?string
    {
        if ($cell === null) {
            return null;
        }
        if (ExcelDate::isDateTime($cell)) {
            $dt = ExcelDate::excelToDateTimeObject($cell->getValue());
            return $dt->format('Y-m-d');
        }
        $text = self::cellText($cell);
        if ($text === '') {
            return null;
        }
        if (preg_match('/^\d{2}-\d{2}-\d{4}$/', $text)) {
            $dt = \DateTime::createFromFormat('!d-m-Y', $text);
            $errors = \DateTime::getLastErrors();
            // DateTime::getLastErrors() returns `false` — not an array with
            // zeroed counts — when the parse had no warnings/errors (PHP 8.2+).
            $clean = $errors === false || ($errors['warning_count'] === 0 && $errors['error_count'] === 0);
            if ($dt && $clean) {
                return $dt->format('Y-m-d');
            }
            return null;
        }
        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $text)) {
            return $text;
        }
        return null;
    }

    /**
     * @param array{tmp_name:string,name:string,size:int,type:string,error:int} $file
     * @return array{rows:array,errors:array,cycle:array}
     */
    public static function parseAndValidateUpload(array $file, int $examCycleId, string $examType, int $departmentId, array $user): array
    {
        if ($file['error'] !== UPLOAD_ERR_OK) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'File upload failed', ['rows' => []]);
        }
        if ($file['size'] > self::MAX_SIZE) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'File exceeds the 5 MB limit', ['rows' => []]);
        }

        $ext = strtolower((string) pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['xlsx', 'csv'], true)) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'Only .xlsx or .csv files are accepted', ['rows' => []]);
        }

        if ($ext === 'xlsx') {
            $signature = file_get_contents($file['tmp_name'], false, null, 0, 2);
            if ($signature !== 'PK') {
                throw new HttpException(422, 'UPLOAD_INVALID', 'File is not a valid .xlsx workbook', ['rows' => []]);
            }
        }

        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']) ?: '';
        finfo_close($finfo);
        $allowedMimes = ['application/zip', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/plain', 'text/csv', 'application/csv', 'application/octet-stream'];
        if (!in_array($mime, $allowedMimes, true)) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'File content does not match a spreadsheet', ['rows' => []]);
        }

        try {
            if ($ext === 'csv') {
                $reader = IOFactory::createReader('Csv');
                $raw = file_get_contents($file['tmp_name']);
                $raw = preg_replace('/^\xEF\xBB\xBF/', '', $raw);
                $delimiter = substr_count($raw, ';') > substr_count($raw, ',') ? ';' : ',';
                $reader->setDelimiter($delimiter);
                $reader->setInputEncoding('UTF-8');
                $tmp = tempnam(sys_get_temp_dir(), 'cuj_csv_');
                file_put_contents($tmp, $raw);
                $spreadsheet = $reader->load($tmp);
                @unlink($tmp);
            } else {
                $reader = IOFactory::createReaderForFile($file['tmp_name']);
                $reader->setReadDataOnly(true);
                $spreadsheet = $reader->load($file['tmp_name']);
            }
        } catch (\Throwable $e) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'Could not read the uploaded file', ['rows' => []]);
        }

        $sheet = $spreadsheet->getSheet(0);
        $highestRow = $sheet->getHighestDataRow();
        $highestCol = 8;

        $headerCells = [];
        for ($c = 1; $c <= $highestCol; $c++) {
            $headerCells[] = self::cellText($sheet->getCell([$c, 1]));
        }
        $headersOk = true;
        foreach (self::REQUIRED_HEADERS as $i => $expected) {
            if (strcasecmp($headerCells[$i] ?? '', $expected) !== 0) {
                $headersOk = false;
                break;
            }
        }
        if (!$headersOk) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'Header row does not match the required template', [
                'rows' => [['row' => 1, 'field' => 'header', 'message' => 'Expected columns: ' . implode(', ', self::REQUIRED_HEADERS)]],
            ]);
        }

        $pdo = Db::conn();
        $programs = $pdo->query('SELECT id, code, name, department_id, total_semesters FROM programs WHERE is_active = 1')->fetchAll();
        $timeSlots = $pdo->query('SELECT id, label FROM time_slots WHERE is_active = 1')->fetchAll();
        $subjectTypes = $pdo->query('SELECT id, name FROM subject_types WHERE is_active = 1')->fetchAll();
        $cycleStmt = $pdo->prepare('SELECT id, start_date, end_date, status FROM exam_cycles WHERE id = :id');
        $cycleStmt->execute(['id' => $examCycleId]);
        $cycle = $cycleStmt->fetch();
        if (!$cycle) {
            throw new HttpException(422, 'VALIDATION', 'Unknown exam cycle', ['exam_cycle_id' => 'Cycle not found']);
        }
        if ($cycle['status'] === 'LOCKED' && $user['role'] === 'DEPT_COORDINATOR') {
            throw new HttpException(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
        }

        $programByName = [];
        $programByCode = [];
        foreach ($programs as $p) {
            if ((int) $p['department_id'] === $departmentId) {
                $programByName[mb_strtolower($p['name'])] = $p;
                $programByCode[mb_strtolower($p['code'])] = $p;
            }
        }
        $slotByLabel = [];
        foreach ($timeSlots as $t) {
            $slotByLabel[mb_strtolower($t['label'])] = $t;
        }
        $stypeByName = [];
        foreach ($subjectTypes as $s) {
            $stypeByName[mb_strtolower($s['name'])] = $s;
        }

        $rows = [];
        $errors = [];
        $seenSlot = [];
        $seenCourse = [];
        $rowCount = 0;

        for ($r = 2; $r <= $highestRow; $r++) {
            $rowValues = [];
            $isEmpty = true;
            for ($c = 1; $c <= $highestCol; $c++) {
                $v = self::cellText($sheet->getCell([$c, $r]));
                $rowValues[] = $v;
                if ($v !== '') {
                    $isEmpty = false;
                }
            }
            if ($isEmpty) {
                continue;
            }

            $rowCount++;
            if ($rowCount > self::MAX_ROWS) {
                $errors[] = ['row' => $r, 'field' => 'file', 'message' => 'Too many rows (max ' . self::MAX_ROWS . ')'];
                break;
            }

            [$programText, $semesterText, $subjectTypeText, , $slotText, $courseCodeRaw, $courseName, $studentsText] = $rowValues;
            $isoDate = self::cellIsoDate($sheet->getCell([4, $r]));
            $courseCode = mb_strtoupper(trim($courseCodeRaw));

            $program = $programByName[mb_strtolower($programText)] ?? $programByCode[mb_strtolower($programText)] ?? null;
            $slot = $slotByLabel[mb_strtolower($slotText)] ?? null;
            $subjectType = $stypeByName[mb_strtolower($subjectTypeText)] ?? null;
            $semester = ctype_digit($semesterText) ? (int) $semesterText : null;
            $studentCount = ctype_digit($studentsText) ? (int) $studentsText : null;

            $rowErrors = [];
            if (!$program) {
                $rowErrors[] = ['field' => 'program', 'message' => "Unknown program \"{$programText}\" for this department"];
            }
            if ($semester === null || $semester < 1 || ($program && $semester > (int) $program['total_semesters'])) {
                $max = $program ? $program['total_semesters'] : '?';
                $rowErrors[] = ['field' => 'semester', 'message' => "Semester must be between 1 and {$max}"];
            }
            if (!$subjectType) {
                $rowErrors[] = ['field' => 'subject_type', 'message' => "Unknown subject type \"{$subjectTypeText}\""];
            }
            if (!$isoDate) {
                $rowErrors[] = ['field' => 'exam_date', 'message' => 'Date must be DD-MM-YYYY or a real Excel date'];
            } elseif ($isoDate < $cycle['start_date'] || $isoDate > $cycle['end_date']) {
                $rowErrors[] = ['field' => 'exam_date', 'message' => "Date must be within {$cycle['start_date']} and {$cycle['end_date']}"];
            }
            if (!$slot) {
                $rowErrors[] = ['field' => 'time_slot', 'message' => "Unknown time slot \"{$slotText}\""];
            }
            if (!preg_match(self::COURSE_CODE_REGEX, $courseCode)) {
                $rowErrors[] = ['field' => 'course_code', 'message' => 'Invalid course code format'];
            }
            $courseNameLen = mb_strlen($courseName);
            if ($courseNameLen < 2 || $courseNameLen > 200) {
                $rowErrors[] = ['field' => 'course_name', 'message' => 'Course name must be 2-200 characters'];
            }
            if ($studentCount === null || $studentCount < 1 || $studentCount > 5000) {
                $rowErrors[] = ['field' => 'student_count', 'message' => 'No. of Students must be an integer between 1 and 5000'];
            }

            if ($program && $slot && $isoDate) {
                $slotKey = $program['id'] . '|' . $semester . '|' . $examType . '|' . $isoDate . '|' . $slot['id'];
                if (isset($seenSlot[$slotKey])) {
                    $rowErrors[] = ['field' => 'exam_date', 'message' => 'Duplicate slot within this file'];
                }
                $seenSlot[$slotKey] = true;
            }
            if ($program && $courseCode) {
                $courseKey = $program['id'] . '|' . $semester . '|' . $examType . '|' . $courseCode;
                if (isset($seenCourse[$courseKey])) {
                    $rowErrors[] = ['field' => 'course_code', 'message' => 'Duplicate course code within this file'];
                }
                $seenCourse[$courseKey] = true;
            }

            foreach ($rowErrors as $err) {
                $errors[] = ['row' => $r, 'field' => $err['field'], 'message' => $err['message']];
            }

            $rows[] = [
                'row' => $r, 'program_id' => $program['id'] ?? null, 'program_name' => $program['name'] ?? null,
                'semester' => $semester, 'subject_type_id' => $subjectType['id'] ?? null,
                'exam_date' => $isoDate, 'time_slot_id' => $slot['id'] ?? null, 'time_slot_label' => $slot['label'] ?? null,
                'course_code' => $courseCode, 'course_name' => $courseName, 'student_count' => $studentCount,
            ];
        }

        if ($rowCount === 0) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'No data rows found', ['rows' => [['row' => 2, 'field' => 'file', 'message' => 'File has no data rows']]]);
        }

        return ['rows' => $rows, 'errors' => $errors, 'cycle' => $cycle];
    }

    public static function insertUpload(array $rows, int $examCycleId, string $examType, int $departmentId, array $user, ?string $ip): array
    {
        return Db::transaction(function ($pdo) use ($rows, $examCycleId, $examType, $departmentId, $user, $ip) {
            $inserted = [];
            foreach ($rows as $row) {
                ClashService::assertNoClash($pdo, $examCycleId, $row['program_id'], $row['program_name'], $row['semester'], $examType, $row['exam_date'], $row['time_slot_id']);
                ClashService::assertNoDuplicateCourse($pdo, $examCycleId, $row['program_id'], $row['semester'], $examType, $row['course_code']);

                $stmt = $pdo->prepare(
                    'INSERT INTO exam_entries
                       (exam_cycle_id, department_id, program_id, semester, exam_type, subject_type_id, time_slot_id,
                        exam_date, course_code, course_name, student_count, created_by)
                     VALUES (:cycle, :dept, :prog, :sem, :type, :stype, :slot, :dt, :code, :name, :students, :by)'
                );
                $stmt->execute([
                    'cycle' => $examCycleId, 'dept' => $departmentId, 'prog' => $row['program_id'], 'sem' => $row['semester'],
                    'type' => $examType, 'stype' => $row['subject_type_id'], 'slot' => $row['time_slot_id'], 'dt' => $row['exam_date'],
                    'code' => $row['course_code'], 'name' => $row['course_name'], 'students' => $row['student_count'], 'by' => $user['id'],
                ]);
                $inserted[] = (int) $pdo->lastInsertId();
            }

            AuditService::log((int) $user['id'], 'ENTRY_BULK_UPLOAD', 'exam_entries', null, [
                'count' => count($inserted), 'examCycleId' => $examCycleId, 'examType' => $examType, 'departmentId' => $departmentId,
            ], $ip, $pdo);

            return $inserted;
        });
    }
}
