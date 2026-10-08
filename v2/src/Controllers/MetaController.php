<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Request;
use App\Core\Response;

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

        Response::json([
            'departments' => $deptStmt->fetchAll(),
            'programs' => $programStmt->fetchAll(),
            'subject_types' => $pdo->query('SELECT id, name FROM subject_types WHERE is_active = 1 ORDER BY id')->fetchAll(),
            'time_slots' => $pdo->query('SELECT id, label, start_time, end_time FROM time_slots WHERE is_active = 1 ORDER BY start_time')->fetchAll(),
            'sessions' => $pdo->query('SELECT id, label, is_current FROM academic_sessions ORDER BY label DESC')->fetchAll(),
            'cycles' => $pdo->query('SELECT id, academic_session_id, title, month_year, start_date, end_date, status FROM exam_cycles ORDER BY start_date DESC')->fetchAll(),
        ]);
    }
}
