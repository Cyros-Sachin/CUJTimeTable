<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Services\AuditService;
use App\Services\EntryService;
use App\Services\ExcelService;
use App\Services\PdfService;
use App\Services\RefNumberService;
use ZipArchive;

class ConsolidatedController
{
    private static function filters(Request $request): array
    {
        $f = $request->query;
        $f['page'] = (int) ($f['page'] ?? 1);
        $f['page_size'] = (int) ($f['page_size'] ?? 20);
        return $f;
    }

    private static function dayWiseSummary(array $rows): array
    {
        $buckets = [];
        foreach ($rows as $row) {
            $key = $row['exam_date'] . '|' . $row['time_slot_label'];
            if (!isset($buckets[$key])) {
                $buckets[$key] = [
                    'exam_date' => $row['exam_date'], 'weekday' => weekday_of($row['exam_date']),
                    'time_slot_label' => $row['time_slot_label'], 'paper_count' => 0, 'total_students' => 0, 'departments' => [],
                ];
            }
            $buckets[$key]['paper_count']++;
            $buckets[$key]['total_students'] += (int) $row['student_count'];
            $buckets[$key]['departments'][$row['department_name']] = true;
        }
        $out = array_values($buckets);
        foreach ($out as &$b) {
            $b['departments'] = array_keys($b['departments']);
        }
        usort($out, fn ($a, $b) => ($a['exam_date'] . $a['time_slot_label']) <=> ($b['exam_date'] . $b['time_slot_label']));
        return $out;
    }

    public function index(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $filters = self::filters($request);

        $result = EntryService::listEntries($user, $filters);
        $allRows = EntryService::listAllEntriesForExport($user, $filters);

        Response::json($result['rows'], 200, [
            'total' => $result['total'], 'page' => $result['page'], 'page_size' => $result['pageSize'],
            'day_wise_summary' => self::dayWiseSummary($allRows),
        ]);
    }

    public function excel(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $filters = self::filters($request);
        $rows = EntryService::listAllEntriesForExport($user, $filters);
        foreach ($rows as &$r) {
            $r['weekday'] = weekday_of($r['exam_date']);
        }
        unset($r);

        $dayWise = self::dayWiseSummary($rows);
        $byDepartment = [];
        foreach ($rows as $r) {
            $byDepartment[$r['department_name']][] = $r;
        }

        $cycleLabel = $rows ? ($rows[0]['cycle_title'] . ' ' . $rows[0]['cycle_month_year']) : 'All';
        $spreadsheet = ExcelService::buildConsolidatedWorkbook($rows, $dayWise, $byDepartment);
        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);

        $safeName = preg_replace('/[^a-z0-9]+/i', '_', $cycleLabel);

        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="CUJ_Consolidated_Datesheet_' . $safeName . '.xlsx"');
        $writer->save('php://output');

        AuditService::log((int) $user['id'], 'EXPORT_EXCEL', 'consolidated', null, $filters, $request->ip);
        exit;
    }

    public function pdf(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $filters = self::filters($request);
        $rows = EntryService::listAllEntriesForExport($user, $filters);
        if (!$rows) {
            throw new HttpException(404, 'NOT_FOUND', 'No entries match these filters');
        }

        $pdfBinary = PdfService::renderOverallPdf([
            'cycleTitle' => $rows[0]['cycle_title'], 'cycleMonthYear' => $rows[0]['cycle_month_year'], 'rows' => $rows,
        ]);

        AuditService::log((int) $user['id'], 'EXPORT_PDF_OVERALL', 'consolidated', null, $filters, $request->ip);

        Response::streamPdf($pdfBinary, 'CUJ_Overall_Datesheet.pdf', false);
    }

    public function zip(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $filters = self::filters($request);
        $rows = EntryService::listAllEntriesForExport($user, $filters);
        if (!$rows) {
            throw new HttpException(404, 'NOT_FOUND', 'No entries match these filters');
        }

        $groups = [];
        foreach ($rows as $r) {
            $key = $r['department_id'] . '|' . $r['program_id'] . '|' . $r['semester'] . '|' . $r['exam_type'];
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'departmentName' => $r['department_name'], 'departmentCode' => $r['department_code'],
                    'programId' => $r['program_id'], 'programName' => $r['program_name'], 'programCode' => $r['program_code'],
                    'semester' => $r['semester'], 'examType' => $r['exam_type'],
                    'cycleTitle' => $r['cycle_title'], 'cycleMonthYear' => $r['cycle_month_year'], 'rows' => [],
                ];
            }
            $groups[$key]['rows'][] = $r;
        }

        $cycleId = (int) ($filters['cycle_id'] ?? $rows[0]['exam_cycle_id'] ?? 0);
        $tmpZip = tempnam(sys_get_temp_dir(), 'cuj_zip_');
        $zip = new ZipArchive();
        $zip->open($tmpZip, ZipArchive::OVERWRITE);

        foreach ($groups as $group) {
            $ref = Db::transaction(fn ($conn) => RefNumberService::getOrCreate($conn, $cycleId, $group['programId'], $group['semester'], $group['examType']));
            $pdfBinary = PdfService::renderDatesheetPdf([
                'refNo' => $ref['ref_no'], 'issuedOn' => $ref['issued_on'], 'cycleTitle' => $group['cycleTitle'], 'cycleMonthYear' => $group['cycleMonthYear'],
                'departmentName' => $group['departmentName'], 'programName' => $group['programName'], 'semester' => $group['semester'],
                'examType' => $group['examType'], 'rows' => $group['rows'],
            ]);
            $examLabel = $group['examType'] === 'REAPPEAR' ? 'Reappear' : 'Regular';
            $cycleSlug = preg_replace('/[,\s]+/', '-', $group['cycleMonthYear']);
            $fileName = "Datesheet_{$group['departmentCode']}_{$group['programCode']}_Sem{$group['semester']}_{$examLabel}_{$cycleSlug}.pdf";
            $zip->addFromString($group['departmentName'] . '/' . $fileName, $pdfBinary);
        }
        $zip->close();
        $binary = (string) file_get_contents($tmpZip);
        @unlink($tmpZip);

        AuditService::log((int) $user['id'], 'EXPORT_ZIP', 'consolidated', null, $filters, $request->ip);

        Response::streamBinary($binary, 'CUJ_All_Datesheets.zip', 'application/zip');
    }
}
