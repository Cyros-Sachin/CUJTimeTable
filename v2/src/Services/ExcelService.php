<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Cell\DataValidation;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

class ExcelService
{
    private static function styleHeaderRow($sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'font' => ['bold' => true, 'color' => ['argb' => 'FFFFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FF1E3A8A']],
            'alignment' => ['horizontal' => 'center', 'vertical' => 'center'],
            'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN]],
        ]);
    }

    private static function borderRange($sheet, string $range): void
    {
        $sheet->getStyle($range)->applyFromArray([
            'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN]],
        ]);
    }

    private static function sanitizeSheetName(string $name): string
    {
        $clean = preg_replace('/[\[\]:\*\?\/\\\\]/', '', $name);
        $clean = mb_substr($clean, 0, 31);
        return $clean === '' ? 'Sheet' : $clean;
    }

    /**
     * Entry upload template. Every choice column (Program, Semester, Subject Type,
     * Date, Time Slot) is a dropdown fed from live data: the programs of the given
     * department, the semesters those programs have, Core/Elective, the exam cycle's
     * date window and the active time slots. Dates are plain DD-MM-YYYY text so the
     * dropdown value is never re-interpreted by Excel's locale.
     */
    public static function buildTemplateWorkbook(string $examType, ?int $cycleId = null, ?int $departmentId = null, ?int $programId = null): Spreadsheet
    {
        $pdo = Db::conn();

        $sql = 'SELECT p.name, p.total_semesters, d.name AS department_name
                  FROM programs p JOIN departments d ON d.id = p.department_id
                 WHERE p.is_active = 1';
        $args = [];
        if ($departmentId) {
            $sql .= ' AND p.department_id = :d';
            $args['d'] = $departmentId;
        }
        if ($programId) {
            $sql .= ' AND p.id = :p';
            $args['p'] = $programId;
        }
        $stmt = $pdo->prepare($sql . ' ORDER BY d.name, p.name');
        $stmt->execute($args);
        $programs = $stmt->fetchAll();

        // Every active department is listed (in scope), even one that has no programs yet.
        $deptSql = 'SELECT name FROM departments WHERE is_active = 1' . ($departmentId ? ' AND id = :d' : '') . ' ORDER BY name';
        $stmt = $pdo->prepare($deptSql);
        $stmt->execute($departmentId ? ['d' => $departmentId] : []);
        $byDept = [];
        foreach ($stmt->fetchAll() as $d) {
            $byDept[$d['name']] = [];
        }
        foreach ($programs as $p) {
            $byDept[$p['department_name']][] = $p;
        }
        $deptNames = array_keys($byDept);
        // Same layout as the admin template: nothing pre-filled, the dropdowns only offer this scope's data.
        $deptName = ($departmentId && count($deptNames) === 1) ? $deptNames[0] : null;

        $timeSlots = $pdo->query('SELECT label FROM time_slots WHERE is_active = 1 ORDER BY start_time')->fetchAll();
        $subjectTypes = $pdo->query('SELECT name FROM subject_types WHERE is_active = 1 ORDER BY id')->fetchAll();

        $cycle = null;
        $dates = [];
        if ($cycleId) {
            $stmt = $pdo->prepare('SELECT title, month_year, start_date, end_date FROM exam_cycles WHERE id = :id');
            $stmt->execute(['id' => $cycleId]);
            $cycle = $stmt->fetch() ?: null;
        }
        if ($cycle) {
            $cursor = new \DateTimeImmutable($cycle['start_date']);
            $end = new \DateTimeImmutable($cycle['end_date']);
            while ($cursor <= $end && count($dates) < 400) {
                $dates[] = $cursor->format('d-m-Y');
                $cursor = $cursor->modify('+1 day');
            }
        }
        $maxSemester = max(1, ...array_map(fn ($p) => (int) $p['total_semesters'], $programs ?: [['total_semesters' => 1]]));

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Entries');
        $listsSheet = $spreadsheet->createSheet();
        $listsSheet->setTitle('Lists');
        $listsSheet->setSheetState(\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet::SHEETSTATE_HIDDEN);
        $guide = $spreadsheet->createSheet();
        $guide->setTitle('Instructions');

        // Lists sheet layout:
        //  A dept name | B first row of its programs in G | C its program count
        //  G program name (grouped by department) | H program's semester count
        //  K subject types | L time slots | M dates | N semester numbers 1..max
        $row = 1;
        foreach ($byDept as $name => $progs) {
            $i = array_search($name, $deptNames, true) + 1;
            $listsSheet->setCellValue("A{$i}", $name);
            // A department with no programs points at the blank row after the block, so its Program list is empty.
            $listsSheet->setCellValue("B{$i}", $progs ? $row : max(count($programs), 0) + 1);
            $listsSheet->setCellValue("C{$i}", max(count($progs), 1));
            foreach ($progs as $p) {
                $listsSheet->setCellValue("G{$row}", $p['name']);
                $listsSheet->setCellValue("H{$row}", (int) $p['total_semesters']);
                $row++;
            }
        }
        foreach ($subjectTypes as $i => $s) {
            $listsSheet->setCellValue('K' . ($i + 1), $s['name']);
        }
        foreach ($timeSlots as $i => $t) {
            $listsSheet->setCellValue('L' . ($i + 1), $t['label']);
        }
        foreach ($dates as $i => $d) {
            $listsSheet->setCellValueExplicit('M' . ($i + 1), $d, \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
        }
        for ($n = 1; $n <= $maxSemester; $n++) {
            $listsSheet->setCellValue('N' . $n, $n);
        }

        $headers = ['Department', 'Program', 'Semester', 'Subject Type', 'Date', 'Time Slot', 'Course Code', 'Course Name', 'No. of Students'];
        foreach ($headers as $i => $h) {
            $sheet->setCellValue([$i + 1, 1], $h);
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($h === 'Course Name' ? 36 : 22);
        }
        self::styleHeaderRow($sheet, 'A1:I1');
        $sheet->freezePane('A2');

        $deptCount = max(count($deptNames), 1);
        $progCount = max(count($programs), 1);
        $lists = [
            'A' => ['range' => "Lists!\$A\$1:\$A\${$deptCount}", 'title' => 'Department'],
            'B' => ['title' => 'Program'],
            'C' => ['title' => 'Semester'],
            'D' => ['range' => 'Lists!$K$1:$K$' . max(count($subjectTypes), 1), 'title' => 'Subject Type'],
            'E' => ['range' => 'Lists!$M$1:$M$' . max(count($dates), 1), 'title' => 'Date'],
            'F' => ['range' => 'Lists!$L$1:$L$' . max(count($timeSlots), 1), 'title' => 'Time Slot'],
        ];

        $sheet->getStyle('E2:E1001')->getNumberFormat()->setFormatCode('@');
        for ($r = 2; $r <= 1001; $r++) {
            foreach ($lists as $col => $def) {
                $dv = $sheet->getCell("{$col}{$r}")->getDataValidation();
                $dv->setType(DataValidation::TYPE_LIST);
                $dv->setErrorStyle(DataValidation::STYLE_STOP);
                $dv->setAllowBlank(true);
                $dv->setShowDropDown(true); // PhpSpreadsheet inverts this: true = arrow visible
                $dv->setShowErrorMessage(true);
                $dv->setErrorTitle($def['title']);
                $dv->setError('Pick a value from the dropdown list.');
                if ($col === 'B') {
                    // Programs follow the department on the same row.
                    $dv->setError('Pick the Department first, then a program from the dropdown.');
                    $dv->setFormula1("OFFSET(Lists!\$G\$1,INDEX(Lists!\$B\$1:\$B\${$deptCount},MATCH(\$A{$r},Lists!\$A\$1:\$A\${$deptCount},0))-1,0,INDEX(Lists!\$C\$1:\$C\${$deptCount},MATCH(\$A{$r},Lists!\$A\$1:\$A\${$deptCount},0)),1)");
                } elseif ($col === 'C') {
                    // Semester choices follow the program on the same row.
                    $dv->setError('Pick the Program first, then a semester from the dropdown.');
                    $dv->setFormula1("OFFSET(Lists!\$N\$1,0,0,INDEX(Lists!\$H\$1:\$H\${$progCount},MATCH(\$B{$r},Lists!\$G\$1:\$G\${$progCount},0)),1)");
                } else {
                    $dv->setFormula1($def['range']);
                }
            }
            $dv = $sheet->getCell("I{$r}")->getDataValidation();
            $dv->setType(DataValidation::TYPE_WHOLE);
            $dv->setOperator(DataValidation::OPERATOR_BETWEEN);
            $dv->setAllowBlank(true);
            $dv->setShowErrorMessage(true);
            $dv->setErrorTitle('No. of Students');
            $dv->setError('Enter a whole number between 1 and 5000.');
            $dv->setFormula1('1');
            $dv->setFormula2('5000');
        }
        self::borderRange($sheet, 'A1:I1');

        $guide->getColumnDimension('A')->setWidth(110);
        $cycleLine = $cycle
            ? "{$cycle['title']} - {$cycle['month_year']} ({$dates[0]} to " . end($dates) . ')'
            : 'not specified';
        $lines = [
            'Exam cycle: ' . $cycleLine,
            'Department: ' . ($deptName ?? 'all departments'),
            'Program: pick from the dropdown (lists the programs of the department chosen on the same row)',
            'Exam type: ' . ($examType === 'REAPPEAR' ? 'Re-appear' : 'Regular'),
            '',
            'Fill one exam per row from row 2 downward.',
            'Department, Program, Semester, Subject Type, Date and Time Slot are dropdowns - pick the value, do not type it.',
            'Program choices depend on the Department, and Semester choices on the Program, of the same row. Only Course Code, Course Name and No. of Students are typed.',
            'Rows with a program from another department are rejected on upload.',
            'Date list contains only the dates of the selected exam cycle.',
            'Course Code: letters/digits, e.g. MBIO1C004T. Course Name: 2-200 characters.',
            'No. of Students: whole number 1-5000.',
            'Do not rename or reorder the header row. Max 1000 rows. Upload the file under the same exam type and cycle.',
            'Download a fresh template if departments, programs, time slots or the cycle dates change.',
        ];
        foreach ($lines as $i => $line) {
            $guide->setCellValue('A' . ($i + 1), $line);
        }
        $guide->getStyle('A1')->getFont()->setBold(true);

        $spreadsheet->setActiveSheetIndex(0);
        return $spreadsheet;
    }

    /**
     * @param array $rows each with weekday/exam_date/... fields (see EntryService::ENTRY_SELECT)
     * @param array $dayWise each with exam_date, weekday, time_slot_label, paper_count, total_students, departments[]
     * @param array<string,array> $byDepartment department name => rows
     */
    public static function buildConsolidatedWorkbook(array $rows, array $dayWise, array $byDepartment): Spreadsheet
    {
        $spreadsheet = new Spreadsheet();
        $consolidated = $spreadsheet->getActiveSheet();
        $consolidated->setTitle('Consolidated');

        $headers = ['S.No', 'Date', 'Day', 'Time', 'Department', 'Program', 'Semester', 'Exam Type', 'Subject Type', 'Course Code', 'Course Name', 'No. of Students'];
        foreach ($headers as $i => $h) {
            $consolidated->setCellValue([$i + 1, 1], $h);
            $consolidated->getColumnDimensionByColumn($i + 1)->setWidth($h === 'Course Name' ? 30 : 16);
        }
        $lastCol = chr(ord('A') + count($headers) - 1);
        self::styleHeaderRow($consolidated, "A1:{$lastCol}1");
        $consolidated->setAutoFilter("A1:{$lastCol}1");
        $consolidated->freezePane('A2');

        $r = 2;
        foreach ($rows as $i => $row) {
            $consolidated->setCellValue("A{$r}", $i + 1);
            $consolidated->setCellValue("B{$r}", ExcelDate::stringToExcel($row['exam_date']));
            $consolidated->getStyle("B{$r}")->getNumberFormat()->setFormatCode('dd-mm-yyyy');
            $consolidated->setCellValue("C{$r}", $row['weekday']);
            $consolidated->setCellValue("D{$r}", $row['time_slot_label']);
            $consolidated->setCellValue("E{$r}", $row['department_name']);
            $consolidated->setCellValue("F{$r}", $row['program_name']);
            $consolidated->setCellValue("G{$r}", $row['semester']);
            $consolidated->setCellValue("H{$r}", $row['exam_type'] === 'REGULAR' ? 'Regular' : 'Re-appear');
            $consolidated->setCellValue("I{$r}", $row['subject_type_name']);
            $consolidated->setCellValue("J{$r}", $row['course_code']);
            $consolidated->setCellValue("K{$r}", $row['course_name']);
            $consolidated->setCellValue("L{$r}", $row['student_count']);
            $r++;
        }
        if ($r > 2) {
            self::borderRange($consolidated, "A1:{$lastCol}" . ($r - 1));
        }

        $dayWiseSheet = $spreadsheet->createSheet();
        $dayWiseSheet->setTitle('Day-wise Summary');
        $dwHeaders = ['Date', 'Day', 'Time', 'No. of Papers', 'Total Students', 'Departments Involved'];
        foreach ($dwHeaders as $i => $h) {
            $dayWiseSheet->setCellValue([$i + 1, 1], $h);
            $dayWiseSheet->getColumnDimensionByColumn($i + 1)->setWidth($h === 'Departments Involved' ? 36 : 18);
        }
        self::styleHeaderRow($dayWiseSheet, 'A1:F1');
        $r = 2;
        foreach ($dayWise as $d) {
            $dayWiseSheet->setCellValue("A{$r}", ExcelDate::stringToExcel($d['exam_date']));
            $dayWiseSheet->getStyle("A{$r}")->getNumberFormat()->setFormatCode('dd-mm-yyyy');
            $dayWiseSheet->setCellValue("B{$r}", $d['weekday']);
            $dayWiseSheet->setCellValue("C{$r}", $d['time_slot_label']);
            $dayWiseSheet->setCellValue("D{$r}", $d['paper_count']);
            $dayWiseSheet->setCellValue("E{$r}", $d['total_students']);
            $dayWiseSheet->setCellValue("F{$r}", implode(', ', $d['departments']));
            $r++;
        }
        if ($r > 2) {
            self::borderRange($dayWiseSheet, 'A1:F' . ($r - 1));
        }

        foreach ($byDepartment as $deptName => $deptRows) {
            $sheet = $spreadsheet->createSheet();
            $sheet->setTitle(self::sanitizeSheetName($deptName));
            $deptHeaders = array_slice($headers, 1);
            foreach ($deptHeaders as $i => $h) {
                $sheet->setCellValue([$i + 1, 1], $h);
                $sheet->getColumnDimensionByColumn($i + 1)->setWidth($h === 'Course Name' ? 30 : 16);
            }
            $lastDeptCol = chr(ord('A') + count($deptHeaders) - 1);
            self::styleHeaderRow($sheet, "A1:{$lastDeptCol}1");

            $r = 2;
            foreach ($deptRows as $row) {
                $sheet->setCellValue("A{$r}", ExcelDate::stringToExcel($row['exam_date']));
                $sheet->getStyle("A{$r}")->getNumberFormat()->setFormatCode('dd-mm-yyyy');
                $sheet->setCellValue("B{$r}", $row['weekday']);
                $sheet->setCellValue("C{$r}", $row['time_slot_label']);
                $sheet->setCellValue("D{$r}", $row['department_name']);
                $sheet->setCellValue("E{$r}", $row['program_name']);
                $sheet->setCellValue("F{$r}", $row['semester']);
                $sheet->setCellValue("G{$r}", $row['exam_type'] === 'REGULAR' ? 'Regular' : 'Re-appear');
                $sheet->setCellValue("H{$r}", $row['subject_type_name']);
                $sheet->setCellValue("I{$r}", $row['course_code']);
                $sheet->setCellValue("J{$r}", $row['course_name']);
                $sheet->setCellValue("K{$r}", $row['student_count']);
                $r++;
            }
            if ($r > 2) {
                self::borderRange($sheet, "A1:{$lastDeptCol}" . ($r - 1));
            }
        }

        $spreadsheet->setActiveSheetIndex(0);
        return $spreadsheet;
    }
}
