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

    public static function buildTemplateWorkbook(string $examType): Spreadsheet
    {
        $pdo = Db::conn();
        $programs = $pdo->query('SELECT name FROM programs WHERE is_active = 1 ORDER BY name')->fetchAll();
        $timeSlots = $pdo->query('SELECT label FROM time_slots WHERE is_active = 1 ORDER BY start_time')->fetchAll();
        $subjectTypes = $pdo->query('SELECT name FROM subject_types WHERE is_active = 1 ORDER BY id')->fetchAll();

        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Entries');
        $listsSheet = $spreadsheet->createSheet();
        $listsSheet->setTitle('Lists');
        $listsSheet->setSheetState(\PhpOffice\PhpSpreadsheet\Worksheet\Worksheet::SHEETSTATE_HIDDEN);

        foreach ($programs as $i => $p) {
            $listsSheet->setCellValue('A' . ($i + 1), $p['name']);
        }
        foreach ($subjectTypes as $i => $s) {
            $listsSheet->setCellValue('B' . ($i + 1), $s['name']);
        }
        foreach ($timeSlots as $i => $t) {
            $listsSheet->setCellValue('C' . ($i + 1), $t['label']);
        }

        $headers = ['Program', 'Semester', 'Subject Type', 'Date', 'Time Slot', 'Course Code', 'Course Name', 'No. of Students'];
        foreach ($headers as $i => $h) {
            $sheet->setCellValue([$i + 1, 1], $h);
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth(22);
        }
        self::styleHeaderRow($sheet, 'A1:H1');

        $sampleProgram = $programs[0]['name'] ?? 'M.Sc. Biotechnology';
        $sampleSubject = $subjectTypes[0]['name'] ?? 'Core';
        $sampleSlot = $timeSlots[0]['label'] ?? '2:00PM-5:00PM';
        $sheet->setCellValue('A2', $sampleProgram);
        $sheet->setCellValue('B2', 2);
        $sheet->setCellValue('C2', $sampleSubject);
        $sheet->setCellValue('D2', ExcelDate::PHPToExcel(new \DateTime()));
        $sheet->getStyle('D2')->getNumberFormat()->setFormatCode('dd-mm-yyyy');
        $sheet->setCellValue('E2', $sampleSlot);
        $sheet->setCellValue('F2', 'MBIO1C004T');
        $sheet->setCellValue('G2', 'Sample Course (' . ($examType === 'REAPPEAR' ? 'Re-appear' : 'Regular') . ')');
        $sheet->setCellValue('H2', 60);

        $programCount = max(count($programs), 1);
        $subjectCount = max(count($subjectTypes), 1);
        $slotCount = max(count($timeSlots), 1);

        for ($row = 2; $row <= 1001; $row++) {
            $dv = $sheet->getCell("A{$row}")->getDataValidation();
            $dv->setType(DataValidation::TYPE_LIST);
            $dv->setAllowBlank(true);
            $dv->setFormula1("Lists!\$A\$1:\$A\${$programCount}");

            $dv = $sheet->getCell("C{$row}")->getDataValidation();
            $dv->setType(DataValidation::TYPE_LIST);
            $dv->setAllowBlank(true);
            $dv->setFormula1("Lists!\$B\$1:\$B\${$subjectCount}");

            $dv = $sheet->getCell("E{$row}")->getDataValidation();
            $dv->setType(DataValidation::TYPE_LIST);
            $dv->setAllowBlank(true);
            $dv->setFormula1("Lists!\$C\$1:\$C\${$slotCount}");
        }

        self::borderRange($sheet, 'A1:H2');
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
