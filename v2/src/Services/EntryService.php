<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpException;
use PDO;

class EntryService
{
    private const ENTRY_SELECT = "
        SELECT e.id, e.exam_cycle_id, e.department_id, e.program_id, e.semester, e.exam_type,
               e.subject_type_id, e.time_slot_id, e.exam_date, e.course_code, e.course_name,
               e.student_count, e.created_at, e.updated_at,
               d.name AS department_name, d.code AS department_code,
               p.name AS program_name, p.code AS program_code,
               st.name AS subject_type_name,
               ts.label AS time_slot_label, ts.start_time,
               ec.title AS cycle_title, ec.month_year AS cycle_month_year
        FROM exam_entries e
        JOIN departments d ON d.id = e.department_id
        JOIN programs p ON p.id = e.program_id
        JOIN subject_types st ON st.id = e.subject_type_id
        JOIN time_slots ts ON ts.id = e.time_slot_id
        JOIN exam_cycles ec ON ec.id = e.exam_cycle_id
    ";

    private static function loadProgram(PDO $pdo, int $programId): array
    {
        $stmt = $pdo->prepare(
            'SELECT p.id, p.name, p.total_semesters, p.department_id, p.is_active, d.name AS department_name
             FROM programs p JOIN departments d ON d.id = p.department_id WHERE p.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $programId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new HttpException(422, 'VALIDATION', 'Unknown program', ['program_id' => 'Program not found']);
        }
        return $row;
    }

    private static function loadCycle(PDO $pdo, int $cycleId): array
    {
        $stmt = $pdo->prepare('SELECT id, title, month_year, start_date, end_date, status FROM exam_cycles WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $cycleId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new HttpException(422, 'VALIDATION', 'Unknown exam cycle', ['exam_cycle_id' => 'Cycle not found']);
        }
        return $row;
    }

    private static function loadTimeSlot(PDO $pdo, int $slotId): array
    {
        $stmt = $pdo->prepare('SELECT id, label FROM time_slots WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $slotId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new HttpException(422, 'VALIDATION', 'Unknown time slot', ['time_slot_id' => 'Time slot not found']);
        }
        return $row;
    }

    private static function assertDepartmentScope(array $user, int $departmentId): void
    {
        if ($user['role'] === 'DEPT_COORDINATOR' && $departmentId !== (int) $user['department_id']) {
            throw new HttpException(404, 'NOT_FOUND', 'Entry not found');
        }
    }

    private static function resolveDepartmentId(array $user, ?int $bodyDepartmentId): int
    {
        if ($user['role'] === 'DEPT_COORDINATOR') {
            return (int) $user['department_id'];
        }
        if (!$bodyDepartmentId) {
            throw new HttpException(422, 'VALIDATION', 'department_id is required', ['department_id' => 'Required']);
        }
        return $bodyDepartmentId;
    }

    private static function validateBusinessRules(int $departmentId, array $program, array $cycle, int $semester, string $examDate): void
    {
        if ((int) $program['department_id'] !== $departmentId) {
            throw new HttpException(422, 'VALIDATION', 'Program does not belong to this department', ['program_id' => 'Program/department mismatch']);
        }
        if ($semester < 1 || $semester > (int) $program['total_semesters']) {
            throw new HttpException(422, 'VALIDATION', 'Semester out of range for this program', ['semester' => "Must be between 1 and {$program['total_semesters']}"]);
        }
        if ($examDate < $cycle['start_date'] || $examDate > $cycle['end_date']) {
            throw new HttpException(422, 'VALIDATION', 'Date is outside the exam cycle window', ['exam_date' => "Must be between {$cycle['start_date']} and {$cycle['end_date']}"]);
        }
    }

    public static function createEntry(array $user, array $body, ?string $ip): array
    {
        return Db::transaction(function (PDO $pdo) use ($user, $body, $ip) {
            $departmentId = self::resolveDepartmentId($user, $body['department_id'] ?? null);
            $program = self::loadProgram($pdo, $body['program_id']);
            $cycle = self::loadCycle($pdo, $body['exam_cycle_id']);
            self::loadTimeSlot($pdo, $body['time_slot_id']);

            if ($cycle['status'] === 'LOCKED' && $user['role'] === 'DEPT_COORDINATOR') {
                throw new HttpException(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
            }

            self::validateBusinessRules($departmentId, $program, $cycle, $body['semester'], $body['exam_date']);
            ClashService::assertNoClash($pdo, $body['exam_cycle_id'], $body['program_id'], $program['name'], $body['semester'], $body['exam_type'], $body['exam_date'], $body['time_slot_id']);
            ClashService::assertNoDuplicateCourse($pdo, $body['exam_cycle_id'], $body['program_id'], $body['semester'], $body['exam_type'], $body['course_code']);

            $stmt = $pdo->prepare(
                'INSERT INTO exam_entries
                   (exam_cycle_id, department_id, program_id, semester, exam_type, subject_type_id, time_slot_id,
                    exam_date, course_code, course_name, student_count, created_by)
                 VALUES (:cycle, :dept, :prog, :sem, :type, :stype, :slot, :dt, :code, :name, :students, :by)'
            );
            $stmt->execute([
                'cycle' => $body['exam_cycle_id'], 'dept' => $departmentId, 'prog' => $body['program_id'], 'sem' => $body['semester'],
                'type' => $body['exam_type'], 'stype' => $body['subject_type_id'], 'slot' => $body['time_slot_id'], 'dt' => $body['exam_date'],
                'code' => $body['course_code'], 'name' => $body['course_name'], 'students' => $body['student_count'], 'by' => $user['id'],
            ]);
            $id = (int) $pdo->lastInsertId();

            AuditService::log((int) $user['id'], 'ENTRY_CREATE', 'exam_entries', (string) $id, $body, $ip, $pdo);

            return self::getEntryById($user, $id, $pdo);
        });
    }

    public static function updateEntry(array $user, int $id, array $body, ?string $ip): array
    {
        return Db::transaction(function (PDO $pdo) use ($user, $id, $body, $ip) {
            $existingStmt = $pdo->prepare('SELECT * FROM exam_entries WHERE id = :id LIMIT 1 FOR UPDATE');
            $existingStmt->execute(['id' => $id]);
            $existing = $existingStmt->fetch();
            if (!$existing) {
                throw new HttpException(404, 'NOT_FOUND', 'Entry not found');
            }
            self::assertDepartmentScope($user, (int) $existing['department_id']);

            $departmentId = $user['role'] === 'DEPT_COORDINATOR'
                ? (int) $user['department_id']
                : (int) ($body['department_id'] ?? $existing['department_id']);

            $merged = [
                'exam_cycle_id' => $body['exam_cycle_id'] ?? (int) $existing['exam_cycle_id'],
                'program_id' => $body['program_id'] ?? (int) $existing['program_id'],
                'semester' => $body['semester'] ?? (int) $existing['semester'],
                'exam_type' => $body['exam_type'] ?? $existing['exam_type'],
                'subject_type_id' => $body['subject_type_id'] ?? (int) $existing['subject_type_id'],
                'time_slot_id' => $body['time_slot_id'] ?? (int) $existing['time_slot_id'],
                'exam_date' => $body['exam_date'] ?? $existing['exam_date'],
                'course_code' => $body['course_code'] ?? $existing['course_code'],
                'course_name' => $body['course_name'] ?? $existing['course_name'],
                'student_count' => $body['student_count'] ?? (int) $existing['student_count'],
            ];

            $program = self::loadProgram($pdo, $merged['program_id']);
            $cycle = self::loadCycle($pdo, $merged['exam_cycle_id']);
            self::loadTimeSlot($pdo, $merged['time_slot_id']);

            if ($cycle['status'] === 'LOCKED' && $user['role'] === 'DEPT_COORDINATOR') {
                throw new HttpException(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
            }

            self::validateBusinessRules($departmentId, $program, $cycle, $merged['semester'], $merged['exam_date']);
            ClashService::assertNoClash($pdo, $merged['exam_cycle_id'], $merged['program_id'], $program['name'], $merged['semester'], $merged['exam_type'], $merged['exam_date'], $merged['time_slot_id'], $id);
            ClashService::assertNoDuplicateCourse($pdo, $merged['exam_cycle_id'], $merged['program_id'], $merged['semester'], $merged['exam_type'], $merged['course_code'], $id);

            $stmt = $pdo->prepare(
                'UPDATE exam_entries SET
                   exam_cycle_id = :cycle, department_id = :dept, program_id = :prog, semester = :sem, exam_type = :type,
                   subject_type_id = :stype, time_slot_id = :slot, exam_date = :dt, course_code = :code,
                   course_name = :name, student_count = :students, updated_by = :by
                 WHERE id = :id'
            );
            $stmt->execute([
                'cycle' => $merged['exam_cycle_id'], 'dept' => $departmentId, 'prog' => $merged['program_id'], 'sem' => $merged['semester'],
                'type' => $merged['exam_type'], 'stype' => $merged['subject_type_id'], 'slot' => $merged['time_slot_id'], 'dt' => $merged['exam_date'],
                'code' => $merged['course_code'], 'name' => $merged['course_name'], 'students' => $merged['student_count'], 'by' => $user['id'], 'id' => $id,
            ]);

            AuditService::log((int) $user['id'], 'ENTRY_UPDATE', 'exam_entries', (string) $id, $merged, $ip, $pdo);

            return self::getEntryById($user, $id, $pdo);
        });
    }

    public static function deleteEntry(array $user, int $id, ?string $ip): void
    {
        Db::transaction(function (PDO $pdo) use ($user, $id, $ip) {
            $stmt = $pdo->prepare('SELECT * FROM exam_entries WHERE id = :id LIMIT 1 FOR UPDATE');
            $stmt->execute(['id' => $id]);
            $existing = $stmt->fetch();
            if (!$existing) {
                throw new HttpException(404, 'NOT_FOUND', 'Entry not found');
            }
            self::assertDepartmentScope($user, (int) $existing['department_id']);

            if ($user['role'] === 'DEPT_COORDINATOR') {
                $cycleStmt = $pdo->prepare('SELECT status FROM exam_cycles WHERE id = :id');
                $cycleStmt->execute(['id' => $existing['exam_cycle_id']]);
                $cycle = $cycleStmt->fetch();
                if ($cycle && $cycle['status'] === 'LOCKED') {
                    throw new HttpException(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
                }
            }

            $del = $pdo->prepare('DELETE FROM exam_entries WHERE id = :id');
            $del->execute(['id' => $id]);

            AuditService::log((int) $user['id'], 'ENTRY_DELETE', 'exam_entries', (string) $id, $existing, $ip, $pdo);
        });
    }

    public static function checkClash(array $user, array $body): array
    {
        return Db::transaction(function (PDO $pdo) use ($user, $body) {
            $departmentId = self::resolveDepartmentId($user, $body['department_id'] ?? null);
            $program = self::loadProgram($pdo, $body['program_id']);
            $cycle = self::loadCycle($pdo, $body['exam_cycle_id']);

            self::validateBusinessRules($departmentId, $program, $cycle, $body['semester'], $body['exam_date']);
            ClashService::assertNoClash($pdo, $body['exam_cycle_id'], $body['program_id'], $program['name'], $body['semester'], $body['exam_type'], $body['exam_date'], $body['time_slot_id'], $body['exclude_id'] ?? null);
            ClashService::assertNoDuplicateCourse($pdo, $body['exam_cycle_id'], $body['program_id'], $body['semester'], $body['exam_type'], $body['course_code'], $body['exclude_id'] ?? null);

            return ['ok' => true];
        });
    }

    public static function getEntryById(array $user, int $id, ?PDO $pdo = null): array
    {
        $conn = $pdo ?? Db::conn();
        $stmt = $conn->prepare(self::ENTRY_SELECT . ' WHERE e.id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new HttpException(404, 'NOT_FOUND', 'Entry not found');
        }
        self::assertDepartmentScope($user, (int) $row['department_id']);
        return $row;
    }

    /** @return array{where:string, params:array<string,mixed>} */
    private static function buildWhere(array $user, array $filters): array
    {
        $where = ['1=1'];
        $params = [];

        $deptScope = $user['role'] === 'DEPT_COORDINATOR' ? (int) $user['department_id'] : ($filters['department_id'] ?? null);
        if ($deptScope) {
            $where[] = 'e.department_id = :deptScope';
            $params['deptScope'] = $deptScope;
        }
        if (!empty($filters['cycle_id'])) {
            $where[] = 'e.exam_cycle_id = :cycleId';
            $params['cycleId'] = $filters['cycle_id'];
        }
        if (!empty($filters['exam_type'])) {
            $where[] = 'e.exam_type = :examType';
            $params['examType'] = $filters['exam_type'];
        }
        if (!empty($filters['program_id'])) {
            $where[] = 'e.program_id = :programId';
            $params['programId'] = $filters['program_id'];
        }
        if (!empty($filters['semester'])) {
            $where[] = 'e.semester = :semester';
            $params['semester'] = $filters['semester'];
        }
        if (!empty($filters['date_from'])) {
            $where[] = 'e.exam_date >= :dateFrom';
            $params['dateFrom'] = $filters['date_from'];
        }
        if (!empty($filters['date_to'])) {
            $where[] = 'e.exam_date <= :dateTo';
            $params['dateTo'] = $filters['date_to'];
        }
        if (!empty($filters['q'])) {
            // PDO's native (non-emulated) prepares reject a placeholder used
            // twice in one query ("Invalid parameter number") — distinct
            // names per occurrence, both bound to the same value.
            $where[] = '(e.course_code LIKE :qCode OR e.course_name LIKE :qName)';
            $params['qCode'] = '%' . $filters['q'] . '%';
            $params['qName'] = '%' . $filters['q'] . '%';
        }

        return ['where' => implode(' AND ', $where), 'params' => $params];
    }

    public static function listAllEntriesForExport(array $user, array $filters): array
    {
        ['where' => $where, 'params' => $params] = self::buildWhere($user, $filters);
        $stmt = Db::conn()->prepare(self::ENTRY_SELECT . " WHERE {$where} ORDER BY e.exam_date ASC, ts.start_time ASC, d.name ASC");
        $stmt->execute($params);
        return $stmt->fetchAll();
    }

    /** @return array{rows:array,total:int,page:int,pageSize:int} */
    public static function listEntries(array $user, array $filters): array
    {
        ['where' => $where, 'params' => $params] = self::buildWhere($user, $filters);

        $page = max(1, (int) ($filters['page'] ?? 1));
        $pageSize = min(100, max(1, (int) ($filters['page_size'] ?? 20)));
        $offset = ($page - 1) * $pageSize;

        $sortMap = [
            'date' => 'e.exam_date ASC, ts.start_time ASC',
            '-date' => 'e.exam_date DESC, ts.start_time DESC',
            'created' => 'e.created_at DESC',
        ];
        $orderBy = $sortMap[$filters['sort'] ?? 'date'] ?? $sortMap['date'];

        $pdo = Db::conn();
        $stmt = $pdo->prepare(self::ENTRY_SELECT . " WHERE {$where} ORDER BY {$orderBy} LIMIT {$pageSize} OFFSET {$offset}");
        $stmt->execute($params);
        $rows = $stmt->fetchAll();

        $countStmt = $pdo->prepare("SELECT COUNT(*) AS total FROM exam_entries e WHERE {$where}");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetch()['total'];

        return ['rows' => $rows, 'total' => $total, 'page' => $page, 'pageSize' => $pageSize];
    }
}
