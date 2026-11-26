<?php

declare(strict_types=1);

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Worksheet\Worksheet;

/** Excel export of a duty roster: date x slot chart, one-row-per-duty roster, per-staff summary. */
class DutyExportService
{
    private static function header(Worksheet $sheet, array $headers, array $widths): void
    {
        foreach ($headers as $i => $h) {
            $sheet->setCellValue([$i + 1, 1], $h);
            $sheet->getColumnDimensionByColumn($i + 1)->setWidth($widths[$i] ?? 16);
        }
        $last = $sheet->getHighestColumn();
        $sheet->getStyle("A1:{$last}1")->applyFromArray([
            'font' => ['bold' => true, 'color' => ['argb' => 'FFFFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['argb' => 'FF1E3A8A']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER, 'vertical' => Alignment::VERTICAL_CENTER, 'wrapText' => true],
        ]);
        $sheet->freezePane('A2');
    }

    private static function finish(Worksheet $sheet): void
    {
        $range = 'A1:' . $sheet->getHighestColumn() . $sheet->getHighestRow();
        $sheet->getStyle($range)->applyFromArray([
            'borders' => ['allBorders' => ['borderStyle' => Border::BORDER_THIN]],
            'alignment' => ['vertical' => Alignment::VERTICAL_TOP],
        ]);
        $sheet->setAutoFilter($range);
    }

    private static function person(array $a): string
    {
        return $a['name'] . ' (' . $a['employee_code'] . ')' . ($a['department_code'] ? ' - ' . $a['department_code'] : '');
    }

    private static function roleLabel(string $role): string
    {
        return $role === 'RESERVE' ? 'Reserve' : 'Invigilator';
    }

    public static function workbook(array $overview): Spreadsheet
    {
        $wb = new Spreadsheet();
        $wb->getDefaultStyle()->getFont()->setName('Arial')->setSize(10);
        $cycle = $overview['cycle'];
        $wb->getProperties()->setTitle('Invigilation Duties - ' . $cycle['title'] . ' ' . $cycle['month_year']);

        // 1. Duty chart: one row per date + slot.
        $chart = $wb->getActiveSheet();
        $chart->setTitle('Duty Chart');
        self::header($chart, ['Date', 'Day', 'Time', 'Papers', 'Students', 'Invigilators Needed', 'Invigilators', 'Reserves', 'Shortfall'],
            [12, 11, 17, 8, 10, 12, 60, 40, 10]);
        $r = 2;
        foreach ($overview['slots'] as $s) {
            $chart->fromArray([
                ddmmyyyy($s['exam_date']), $s['weekday'], $s['time_slot_label'], $s['paper_count'], $s['total_students'], $s['required'],
                implode("\n", array_map([self::class, 'person'], $s['invigilators'])),
                implode("\n", array_map([self::class, 'person'], $s['reserves'])),
                $s['shortfall'] + $s['reserve_shortfall'],
            ], null, "A{$r}", true);
            if ($s['shortfall'] + $s['reserve_shortfall'] > 0) {
                $chart->getStyle("I{$r}")->getFont()->setBold(true)->getColor()->setARGB('FFB91C1C');
            }
            $r++;
        }
        $chart->getStyle('G2:H' . max(2, $r - 1))->getAlignment()->setWrapText(true);
        self::finish($chart);

        // 2. Roster: one row per duty.
        $roster = $wb->createSheet();
        $roster->setTitle('Duty Roster');
        self::header($roster, ['S.No', 'Date', 'Day', 'Time', 'Role', 'Employee Code', 'Name', 'Department', 'Designation', 'Email', 'Phone', 'Assigned'],
            [7, 12, 11, 17, 12, 15, 28, 44, 22, 30, 14, 10]);
        $r = 2;
        foreach ($overview['slots'] as $s) {
            foreach (array_merge($s['invigilators'], $s['reserves']) as $a) {
                $roster->fromArray([
                    $r - 1, ddmmyyyy($s['exam_date']), $s['weekday'], $s['time_slot_label'], self::roleLabel($a['role']),
                    $a['employee_code'], $a['name'], $a['department_name'] ?? '', $a['designation'] ?? '',
                    $a['email'] ?? '', $a['phone'] ?? '', $a['is_manual'] ? 'Manual' : 'Auto',
                ], null, "A{$r}", true);
                $roster->getCell("F{$r}")->setValueExplicit($a['employee_code'], \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
                $roster->getCell("K{$r}")->setValueExplicit((string) ($a['phone'] ?? ''), \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
                $r++;
            }
        }
        self::finish($roster);

        // 3. Staff summary: duty load per person, to check the rotation is even.
        $summary = $wb->createSheet();
        $summary->setTitle('Staff Summary');
        self::header($summary, ['Employee Code', 'Name', 'Department', 'Designation', 'Invigilation', 'Reserve', 'Total', 'Duty Dates'],
            [15, 28, 44, 22, 12, 10, 8, 70]);
        $r = 2;
        foreach ($overview['staff_load'] as $l) {
            $dates = array_map(fn ($d) => ddmmyyyy($d['exam_date']) . ' ' . $d['time_slot_label'] . ($d['role'] === 'RESERVE' ? ' (R)' : ''), $l['duties']);
            $summary->fromArray([
                $l['employee_code'], $l['name'], $l['department_name'] ?? '', $l['designation'] ?? '',
                $l['invigilator'], $l['reserve'], $l['total'], implode('; ', $dates),
            ], null, "A{$r}", true);
            $summary->getCell("A{$r}")->setValueExplicit($l['employee_code'], \PhpOffice\PhpSpreadsheet\Cell\DataType::TYPE_STRING);
            $r++;
        }
        $summary->getStyle('H2:H' . max(2, $r - 1))->getAlignment()->setWrapText(true);
        self::finish($summary);

        $wb->setActiveSheetIndex(0);
        return $wb;
    }
}
