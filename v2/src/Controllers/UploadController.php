<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\AuditService;
use App\Services\ExcelService;
use App\Services\UploadService;

class UploadController
{
    public function template(Request $request): void
    {
        $user = Auth::requireLogin();
        $examType = ($request->queryParam('exam_type') === 'REAPPEAR') ? 'REAPPEAR' : 'REGULAR';

        $cycleId = (int) $request->queryParam('exam_cycle_id', 0) ?: null;
        $departmentId = $user['role'] === 'DEPT_COORDINATOR'
            ? (int) $user['department_id']
            : ((int) $request->queryParam('department_id', 0) ?: null);

        $spreadsheet = ExcelService::buildTemplateWorkbook($examType, $cycleId, $departmentId, (int) $request->queryParam('program_id', 0) ?: null);
        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx($spreadsheet);

        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="Entry_Template_' . $examType . '.xlsx"');
        $writer->save('php://output');
        exit;
    }

    public function bulkUpload(Request $request): void
    {
        $user = Auth::requireLogin();

        $body = Validator::validate($request->all(), [
            'exam_cycle_id' => ['required', 'int', 'min:1'],
            'exam_type' => ['required', 'string', 'in:REGULAR,REAPPEAR'],
        ]);
        $dryRun = (string) $request->input('dry_run', 'false') === 'true';
        $bodyDepartmentId = $request->input('department_id');

        $departmentId = $user['role'] === 'DEPT_COORDINATOR' ? (int) $user['department_id'] : ($bodyDepartmentId ? (int) $bodyDepartmentId : null);

        if (empty($_FILES['file'])) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'No file uploaded', ['rows' => []]);
        }

        try {
            ['rows' => $rows, 'errors' => $errors] = UploadService::parseAndValidateUpload(
                $_FILES['file'],
                $body['exam_cycle_id'],
                $body['exam_type'],
                $departmentId,
                $user,
            );
        } catch (HttpException $e) {
            if (in_array($e->errorCode, ['CLASH', 'DUPLICATE_COURSE'], true)) {
                AuditService::log((int) $user['id'], 'ENTRY_CLASH_BLOCKED', 'exam_entries', null, ['code' => $e->errorCode], $request->ip);
            }
            throw $e;
        }

        if ($errors) {
            throw new HttpException(422, 'UPLOAD_INVALID', count($errors) . ' row(s) failed validation', ['rows' => $errors]);
        }

        if ($dryRun) {
            Response::json(['valid' => count($rows), 'rows' => $rows]);
        }

        $inserted = UploadService::insertUpload($rows, $body['exam_cycle_id'], $body['exam_type'], $departmentId, $user, $request->ip);
        Response::json(['inserted' => count($inserted)], 201);
    }
}
