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

    /**
     * WHERE clause for the date-wise views, built from the date sheet page's filters.
     * Coordinators are always pinned to their own department.
     *
     * @return array{0: string[], 1: array<string, mixed>}
     */
    private static function filterWhere(array $user, array $q): array
    {
        $where = ['e.exam_cycle_id = :cycleId', 'e.exam_type = :examType'];
        $params = ['cycleId' => $q['cycle_id'], 'examType' => $q['exam_type']];
        $deptScope = $user['role'] === 'DEPT_COORDINATOR' ? (int) $user['department_id'] : ($q['department_id'] ?? null);
        if ($deptScope) {
            $where[] = 'e.department_id = :deptId';
            $params['deptId'] = $deptScope;
        }
        if (!empty($q['program_id'])) {
            $where[] = 'e.program_id = :progId';
            $params['progId'] = $q['program_id'];
        }
        if (!empty($q['semester'])) {
            $where[] = 'e.semester = :sem';
            $params['sem'] = $q['semester'];
        }
        return [$where, $params];
    }

    private const FILTER_RULES = [
        'cycle_id' => ['required', 'int', 'min:1'],
        'exam_type' => ['required', 'string', 'in:REGULAR,REAPPEAR'],
        'department_id' => ['int', 'min:1'],
        'program_id' => ['int', 'min:1'],
        'semester' => ['int', 'min:1'],
    ];

    /** Distinct exam dates (with counts) matching the current filters — feeds the date-wise PDF picker. */
    public function dates(Request $request): void
    {
        $user = Auth::requireLogin();
        $q = Validator::validate($request->query, self::FILTER_RULES);
        [$where, $params] = self::filterWhere($user, $q);

        $stmt = Db::conn()->prepare(
            'SELECT e.exam_date, COUNT(*) AS exam_count FROM exam_entries e
             WHERE ' . implode(' AND ', $where) . '
             GROUP BY e.exam_date ORDER BY e.exam_date ASC'
        );
        $stmt->execute($params);
        $rows = array_map(static function ($row) {
            $row['exam_count'] = (int) $row['exam_count'];
            return $row;
        }, $stmt->fetchAll());

        Response::json($rows);
    }

    /** One PDF with every exam on a single date, across all departments/programs/semesters in the filter. */
    public function datePdf(Request $request): void
    {
        $user = Auth::requireLogin();
        $q = Validator::validate($request->query, self::FILTER_RULES + [
            'date' => ['required', 'date'],
            'download' => ['int'],
        ]);
        $download = (bool) ($q['download'] ?? 0);

        $pdo = Db::conn();
        $cycleStmt = $pdo->prepare('SELECT id, title, month_year FROM exam_cycles WHERE id = :id');
        $cycleStmt->execute(['id' => $q['cycle_id']]);
        $cycle = $cycleStmt->fetch();
        if (!$cycle) {
            throw new HttpException(404, 'NOT_FOUND', 'Exam cycle not found');
        }

        [$where, $params] = self::filterWhere($user, $q);
        $where[] = 'e.exam_date = :examDate';
        $params['examDate'] = $q['date'];

        // A course shared by several programs/semesters (same code, name and slot) prints once.
        $entryStmt = $pdo->prepare(
            'SELECT e.exam_date, e.course_code, e.course_name, ts.label AS time_slot_label, ts.start_time
             FROM exam_entries e JOIN time_slots ts ON ts.id = e.time_slot_id
             WHERE ' . implode(' AND ', $where) . '
             GROUP BY e.exam_date, e.course_code, e.course_name, ts.id, ts.label, ts.start_time
             ORDER BY ts.start_time ASC, e.course_code ASC'
        );
        $entryStmt->execute($params);
        $rows = $entryStmt->fetchAll();
        if (!$rows) {
            throw new HttpException(404, 'NOT_FOUND', 'No exams found on this date for the selected filters');
        }

        $pdfBinary = PdfService::renderDatesheetPdf([
            'refNo' => '', 'issuedOn' => date('Y-m-d'), 'cycleTitle' => $cycle['title'], 'cycleMonthYear' => $cycle['month_year'],
            'title' => 'DATE SHEET FOR ' . mb_strtoupper(long_date($q['date'])),
            'departmentName' => null, 'programName' => null, 'semester' => null,
            'examType' => $q['exam_type'], 'rows' => $rows,
        ]);

        AuditService::log((int) $user['id'], 'PDF_EXPORT', 'datesheet_date', $q['date'] . '-' . $q['exam_type'], ['cycleId' => $q['cycle_id'], 'filters' => array_intersect_key($q, array_flip(['department_id', 'program_id', 'semester']))], $request->ip);

        $examLabel = $q['exam_type'] === 'REAPPEAR' ? 'Reappear' : 'Regular';
        $filename = "Datesheet_{$q['date']}_{$examLabel}.pdf";

        Response::streamPdf($pdfBinary, $filename, $download);
    }
}
