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

/**
 * Program-wise date sheet: every semester of one program in a single continuous table.
 * Coordinators are pinned to their own department (other departments' programs 404).
 */
class ProgramSheetController
{
    private const RULES = [
        'cycle_id' => ['required', 'int', 'min:1'],
        'exam_type' => ['required', 'string', 'in:REGULAR,REAPPEAR'],
        'program_id' => ['required', 'int', 'min:1'],
    ];

    /** Program + its department, scoped to the caller. */
    private static function program(array $user, int $programId): array
    {
        $stmt = Db::conn()->prepare(
            'SELECT p.id, p.name, p.code, p.department_id, d.name AS department_name, d.code AS department_code
             FROM programs p JOIN departments d ON d.id = p.department_id WHERE p.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $programId]);
        $program = $stmt->fetch();
        if (!$program) {
            throw new HttpException(404, 'NOT_FOUND', 'Program not found');
        }
        if ($user['role'] === 'DEPT_COORDINATOR' && (int) $program['department_id'] !== (int) $user['department_id']) {
            throw new HttpException(404, 'NOT_FOUND', 'Program not found');
        }
        return $program;
    }

    /** Per-semester counts and date ranges for the chosen program. */
    public function summary(Request $request): void
    {
        $user = Auth::requireLogin();
        $q = Validator::validate($request->query, self::RULES);
        self::program($user, $q['program_id']);

        $stmt = Db::conn()->prepare(
            'SELECT e.semester, COUNT(*) AS course_count, MIN(e.exam_date) AS first_date, MAX(e.exam_date) AS last_date
             FROM exam_entries e
             WHERE e.exam_cycle_id = :cycle AND e.program_id = :prog AND e.exam_type = :type
             GROUP BY e.semester ORDER BY e.semester ASC'
        );
        $stmt->execute(['cycle' => $q['cycle_id'], 'prog' => $q['program_id'], 'type' => $q['exam_type']]);
        $rows = array_map(static function ($row) {
            $row['semester'] = (int) $row['semester'];
            $row['course_count'] = (int) $row['course_count'];
            return $row;
        }, $stmt->fetchAll());

        Response::json($rows);
    }

    /** One PDF covering all semesters of a program, semester groups in one table. */
    public function pdf(Request $request): void
    {
        $user = Auth::requireLogin();
        $q = Validator::validate($request->query, self::RULES + ['download' => ['int']]);
        $download = (bool) ($q['download'] ?? 0);
        $program = self::program($user, $q['program_id']);

        $pdo = Db::conn();
        $cycleStmt = $pdo->prepare('SELECT id, title, month_year FROM exam_cycles WHERE id = :id');
        $cycleStmt->execute(['id' => $q['cycle_id']]);
        $cycle = $cycleStmt->fetch();
        if (!$cycle) {
            throw new HttpException(404, 'NOT_FOUND', 'Exam cycle not found');
        }

        $entryStmt = $pdo->prepare(
            'SELECT e.exam_date, e.semester, e.course_code, e.course_name, ts.label AS time_slot_label, ts.start_time
             FROM exam_entries e JOIN time_slots ts ON ts.id = e.time_slot_id
             WHERE e.exam_cycle_id = :cycle AND e.program_id = :prog AND e.exam_type = :type
             ORDER BY e.semester ASC, e.exam_date ASC, ts.start_time ASC, e.course_code ASC'
        );
        $entryStmt->execute(['cycle' => $q['cycle_id'], 'prog' => $q['program_id'], 'type' => $q['exam_type']]);
        $rows = $entryStmt->fetchAll();
        if (!$rows) {
            throw new HttpException(404, 'NOT_FOUND', 'No entries found for this program/type in the selected cycle yet');
        }

        $semesters = [];
        foreach ($rows as $row) {
            $sem = (int) $row['semester'];
            $semesters[$sem] ??= ['programName' => $program['name'], 'semester' => $sem, 'rows' => []];
            $semesters[$sem]['rows'][] = $row;
        }
        $groups = [['departmentName' => $program['department_name'], 'semesters' => array_values($semesters)]];

        $extras = pdf_extras($user, $request->query);

        $pdfBinary = PdfService::renderDatesheetPdf([
            'issuedOn' => date('Y-m-d'), 'cycleTitle' => $cycle['title'], 'cycleMonthYear' => $cycle['month_year'],
            'departmentName' => $program['department_name'], 'programName' => $program['name'], 'semester' => null,
            'examType' => $q['exam_type'], 'rows' => $rows, 'groups' => $groups,
            'serial' => $extras['serial'], 'note' => $extras['note'],
        ]);

        AuditService::log((int) $user['id'], 'PDF_EXPORT', 'datesheet_program', $q['program_id'] . '-' . $q['exam_type'], ['cycleId' => $q['cycle_id'], 'semesters' => array_keys($semesters)], $request->ip);

        $examLabel = $q['exam_type'] === 'REAPPEAR' ? 'Reappear' : 'Regular';
        $cycleSlug = preg_replace('/[,\s]+/', '-', $cycle['month_year']);
        $filename = "Datesheet_{$program['department_code']}_{$program['code']}_AllSem_{$examLabel}_{$cycleSlug}.pdf";

        Response::streamPdf($pdfBinary, $filename, $download);
    }
}
