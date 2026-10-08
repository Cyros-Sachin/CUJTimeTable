<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\Request;
use App\Core\Response;

class DashboardController
{
    public function stats(Request $request): void
    {
        $user = Auth::requireLogin();
        $isCoordinator = $user['role'] === 'DEPT_COORDINATOR';
        $pdo = Db::conn();
        $deptId = (int) $user['department_id'];

        if ($isCoordinator) {
            $entryCount = self::scalar($pdo, 'SELECT COUNT(*) AS c FROM exam_entries WHERE department_id = :d', ['d' => $deptId]);
            $programCount = self::scalar($pdo, 'SELECT COUNT(DISTINCT program_id) AS c FROM exam_entries WHERE department_id = :d', ['d' => $deptId]);
            $nextExam = self::scalarNullable($pdo, 'SELECT MIN(exam_date) AS c FROM exam_entries WHERE department_id = :d AND exam_date >= CURDATE()', ['d' => $deptId]);
            $clashesBlocked = self::scalar(
                $pdo,
                "SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'ENTRY_CLASH_BLOCKED' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
                 AND user_id IN (SELECT id FROM users WHERE department_id = :d)",
                ['d' => $deptId]
            );
        } else {
            $entryCount = self::scalar($pdo, 'SELECT COUNT(*) AS c FROM exam_entries', []);
            $programCount = self::scalar($pdo, 'SELECT COUNT(DISTINCT program_id) AS c FROM exam_entries', []);
            $nextExam = self::scalarNullable($pdo, 'SELECT MIN(exam_date) AS c FROM exam_entries WHERE exam_date >= CURDATE()', []);
            $clashesBlocked = self::scalar($pdo, "SELECT COUNT(*) AS c FROM audit_logs WHERE action = 'ENTRY_CLASH_BLOCKED' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)", []);
        }

        $data = [
            'entries' => $entryCount,
            'programs_covered' => $programCount,
            'next_exam_date' => $nextExam,
            'clashes_blocked_week' => $clashesBlocked,
        ];

        if (!$isCoordinator) {
            $stmt = $pdo->query("
                SELECT d.id, d.name, d.code,
                       COUNT(DISTINCT CONCAT(e.program_id, '-', e.semester, '-', e.exam_type)) AS groups_with_entries,
                       MAX(e.updated_at) AS last_updated
                FROM departments d
                LEFT JOIN exam_entries e ON e.department_id = d.id
                WHERE d.is_active = 1
                GROUP BY d.id, d.name, d.code
                ORDER BY d.name
            ");
            $data['department_status'] = array_map(static function ($row) {
                $row['groups_with_entries'] = (int) $row['groups_with_entries'];
                return $row;
            }, $stmt->fetchAll());
        }

        Response::json($data);
    }

    private static function scalar(\PDO $pdo, string $sql, array $params): int
    {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetch()['c'];
    }

    private static function scalarNullable(\PDO $pdo, string $sql, array $params): ?string
    {
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $val = $stmt->fetch()['c'];
        return $val === null ? null : (string) $val;
    }
}
