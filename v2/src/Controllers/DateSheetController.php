<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\AuditService;
use App\Services\PdfService;
use App\Services\RefNumberService;

class DateSheetController
{
    public function index(Request $request): void
    {
        $user = Auth::requireLogin();
        $q = Validator::validate($request->query, [
            'cycle_id' => ['required', 'int', 'min:1'],
            'exam_type' => ['required', 'string', 'in:REGULAR,REAPPEAR'],
            'department_id' => ['int', 'min:1'],
        ]);

        $deptScope = $user['role'] === 'DEPT_COORDINATOR' ? (int) $user['department_id'] : ($q['department_id'] ?? null);
        $where = ['e.exam_cycle_id = :cycleId', 'e.exam_type = :examType'];
        $params = ['cycleId' => $q['cycle_id'], 'examType' => $q['exam_type']];
        if ($deptScope) {
            $where[] = 'e.department_id = :deptId';
            $params['deptId'] = $deptScope;
        }

        $sql = '
            SELECT e.department_id, d.name AS department_name, d.code AS department_code,
                   e.program_id, p.name AS program_name, p.code AS program_code, p.total_semesters,
                   e.semester, COUNT(*) AS course_count, MIN(e.exam_date) AS first_date, MAX(e.exam_date) AS last_date,
                   MAX(e.updated_at) AS last_updated, r.ref_no, r.issued_on
            FROM exam_entries e
            JOIN departments d ON d.id = e.department_id
            JOIN programs p ON p.id = e.program_id
            LEFT JOIN datesheet_refs r ON r.exam_cycle_id = e.exam_cycle_id AND r.program_id = e.program_id
              AND r.semester = e.semester AND r.exam_type = e.exam_type
            WHERE ' . implode(' AND ', $where) . '
            GROUP BY e.department_id, d.name, d.code, e.program_id, p.name, p.code, p.total_semesters, e.semester, r.ref_no, r.issued_on
            ORDER BY d.name, p.name, e.semester
        ';
        $stmt = Db::conn()->prepare($sql);
        $stmt->execute($params);
        $rows = array_map(static function ($row) {
            $row['course_count'] = (int) $row['course_count'];
            return $row;
        }, $stmt->fetchAll());

        Response::json($rows);
    }

    public function pdf(Request $request): void
    {
        $user = Auth::requireLogin();
        $q = Validator::validate($request->query, [
            'cycle_id' => ['required', 'int', 'min:1'],
            'program_id' => ['required', 'int', 'min:1'],
            'semester' => ['required', 'int', 'min:1'],
            'exam_type' => ['required', 'string', 'in:REGULAR,REAPPEAR'],
            'download' => ['int'],
        ]);
        $download = (bool) ($q['download'] ?? 0);

        $pdo = Db::conn();
        $progStmt = $pdo->prepare(
            'SELECT p.id, p.name, p.code, p.department_id, d.name AS department_name, d.code AS department_code
             FROM programs p JOIN departments d ON d.id = p.department_id WHERE p.id = :id LIMIT 1'
        );
        $progStmt->execute(['id' => $q['program_id']]);
        $program = $progStmt->fetch();
        if (!$program) {
            throw new HttpException(404, 'NOT_FOUND', 'Program not found');
        }
        if ($user['role'] === 'DEPT_COORDINATOR' && (int) $program['department_id'] !== (int) $user['department_id']) {
            throw new HttpException(404, 'NOT_FOUND', 'Program not found');
        }

        $cycleStmt = $pdo->prepare('SELECT id, title, month_year FROM exam_cycles WHERE id = :id');
        $cycleStmt->execute(['id' => $q['cycle_id']]);
        $cycle = $cycleStmt->fetch();
        if (!$cycle) {
            throw new HttpException(404, 'NOT_FOUND', 'Exam cycle not found');
        }

        $entryStmt = $pdo->prepare(
            'SELECT e.exam_date, e.course_code, e.course_name, ts.label AS time_slot_label, ts.start_time
             FROM exam_entries e JOIN time_slots ts ON ts.id = e.time_slot_id
             WHERE e.exam_cycle_id = :cycle AND e.program_id = :prog AND e.semester = :sem AND e.exam_type = :type
             ORDER BY e.exam_date ASC, ts.start_time ASC'
        );
        $entryStmt->execute(['cycle' => $q['cycle_id'], 'prog' => $q['program_id'], 'sem' => $q['semester'], 'type' => $q['exam_type']]);
        $rows = $entryStmt->fetchAll();
        if (!$rows) {
            throw new HttpException(404, 'NOT_FOUND', 'No entries found for this program/semester/type yet');
        }

        $ref = Db::transaction(fn ($conn) => RefNumberService::getOrCreate($conn, $q['cycle_id'], $q['program_id'], $q['semester'], $q['exam_type']));

        $pdfBinary = PdfService::renderDatesheetPdf([
            'refNo' => $ref['ref_no'], 'issuedOn' => $ref['issued_on'], 'cycleTitle' => $cycle['title'], 'cycleMonthYear' => $cycle['month_year'],
            'departmentName' => $program['department_name'], 'programName' => $program['name'], 'semester' => $q['semester'],
            'examType' => $q['exam_type'], 'rows' => $rows,
        ]);

        AuditService::log((int) $user['id'], 'PDF_EXPORT', 'datesheet', $q['program_id'] . '-' . $q['semester'] . '-' . $q['exam_type'], ['refNo' => $ref['ref_no'], 'cycleId' => $q['cycle_id']], $request->ip);

        $examLabel = $q['exam_type'] === 'REAPPEAR' ? 'Reappear' : 'Regular';
        $cycleSlug = preg_replace('/[,\s]+/', '-', $cycle['month_year']);
        $filename = "Datesheet_{$program['department_code']}_{$program['code']}_Sem{$q['semester']}_{$examLabel}_{$cycleSlug}.pdf";

        Response::streamPdf($pdfBinary, $filename, $download);
    }
}
