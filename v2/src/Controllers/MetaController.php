<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Request;
use App\Core\Response;
use App\Services\CycleAccessService;

class MetaController
{
    public function index(Request $request): void
    {
        $user = Auth::requireLogin();
        $isCoordinator = $user['role'] === 'DEPT_COORDINATOR';
        $pdo = Db::conn();

        if ($isCoordinator) {
            $deptStmt = $pdo->prepare('SELECT id, code, name FROM departments WHERE id = :id AND is_active = 1 ORDER BY name');
            $deptStmt->execute(['id' => $user['department_id']]);
            $programStmt = $pdo->prepare('SELECT id, code, name, department_id, total_semesters FROM programs WHERE department_id = :id AND is_active = 1 ORDER BY name');
            $programStmt->execute(['id' => $user['department_id']]);
        } else {
            $deptStmt = $pdo->query('SELECT id, code, name FROM departments WHERE is_active = 1 ORDER BY name');
            $programStmt = $pdo->query('SELECT id, code, name, department_id, total_semesters FROM programs WHERE is_active = 1 ORDER BY name');
        }

        // Locked cycles are hidden from every dropdown (admins unlock them on the Sessions & Cycles page).
        $cycleWhere = "WHERE status <> 'LOCKED'";

        $cycles = $pdo->query('SELECT id, academic_session_id, title, month_year, start_date, end_date, submission_deadline, status FROM exam_cycles ' . $cycleWhere . ' ORDER BY start_date DESC')->fetchAll();

        // Coordinators get their own edit access per cycle (deadline + any Exam Cell re-open grant).
        $grants = [];
        if ($isCoordinator) {
            $grantStmt = $pdo->prepare('SELECT exam_cycle_id, unlocked_until FROM cycle_department_unlocks WHERE department_id = :d');
            $grantStmt->execute(['d' => $user['department_id']]);
            foreach ($grantStmt->fetchAll() as $g) {
                $grants[(int) $g['exam_cycle_id']] = $g;
            }
        }
        foreach ($cycles as &$c) {
            $c['deadline_passed'] = CycleAccessService::deadlinePassed($c['submission_deadline']);
            if ($isCoordinator) {
                $c += CycleAccessService::evaluate($c['status'], $c['submission_deadline'], $grants[(int) $c['id']] ?? null);
            } else {
                $c['can_edit'] = true;
                $c['lock_reason'] = null;
            }
        }
        unset($c);

        Response::json([
            'departments' => $deptStmt->fetchAll(),
            'programs' => $programStmt->fetchAll(),
            'subject_types' => $pdo->query('SELECT id, name FROM subject_types WHERE is_active = 1 ORDER BY id')->fetchAll(),
            'time_slots' => $pdo->query('SELECT id, label, start_time, end_time FROM time_slots WHERE is_active = 1 ORDER BY start_time')->fetchAll(),
            'sessions' => $pdo->query('SELECT id, label, is_current FROM academic_sessions ORDER BY label DESC')->fetchAll(),
            'cycles' => $cycles,
        ]);
    }
}
