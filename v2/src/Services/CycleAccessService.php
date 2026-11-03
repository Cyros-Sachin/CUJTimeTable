<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\HttpException;
use PDO;

/**
 * Decides whether a department coordinator may still change entries in an exam cycle.
 *
 * A coordinator is blocked when either:
 *  - the cycle is manually LOCKED by the Exam Cell (absolute; per-department grants don't override it), or
 *  - the cycle's submission_deadline has passed (the deadline day itself is still open) and the
 *    Exam Cell hasn't re-opened the cycle for that department (cycle_department_unlocks).
 *
 * EXAM_CELL users are never blocked.
 */
class CycleAccessService
{
    public static function today(): string
    {
        return date('Y-m-d');
    }

    public static function deadlinePassed(?string $deadline): bool
    {
        return $deadline !== null && $deadline !== '' && self::today() > substr($deadline, 0, 10);
    }

    public static function grantActive(?array $grant): bool
    {
        if (!$grant) {
            return false;
        }
        $until = $grant['unlocked_until'] ?? null;
        return $until === null || self::today() <= substr((string) $until, 0, 10);
    }

    /**
     * @return array{can_edit:bool, lock_reason:?string, deadline_passed:bool, unlocked_until:?string, reopened:bool}
     */
    public static function accessFor(PDO $pdo, int $cycleId, int $departmentId): array
    {
        $stmt = $pdo->prepare(
            'SELECT c.status, c.submission_deadline, u.exam_cycle_id AS grant_cycle, u.unlocked_until
             FROM exam_cycles c
             LEFT JOIN cycle_department_unlocks u ON u.exam_cycle_id = c.id AND u.department_id = :dept
             WHERE c.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $cycleId, 'dept' => $departmentId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new HttpException(422, 'VALIDATION', 'Unknown exam cycle', ['exam_cycle_id' => 'Cycle not found']);
        }
        return self::evaluate($row['status'], $row['submission_deadline'], $row['grant_cycle'] !== null ? $row : null);
    }

    /**
     * @return array{can_edit:bool, lock_reason:?string, deadline_passed:bool, unlocked_until:?string, reopened:bool}
     */
    public static function evaluate(string $status, ?string $deadline, ?array $grant): array
    {
        $passed = self::deadlinePassed($deadline);
        $reopened = $passed && self::grantActive($grant);
        $reason = null;
        if ($status === 'LOCKED') {
            $reason = 'CYCLE_LOCKED';
        } elseif ($passed && !$reopened) {
            $reason = 'DEADLINE_PASSED';
        }
        return [
            'can_edit' => $reason === null,
            'lock_reason' => $reason,
            'deadline_passed' => $passed,
            'unlocked_until' => $reopened ? ($grant['unlocked_until'] ?? null) : null,
            'reopened' => $reopened,
        ];
    }

    /** Throws 403 when a coordinator may not change entries of $departmentId in $cycleId. */
    public static function assertCanEdit(PDO $pdo, array $user, int $cycleId, int $departmentId): void
    {
        if ($user['role'] !== 'DEPT_COORDINATOR') {
            return;
        }
        $access = self::accessFor($pdo, $cycleId, $departmentId);
        if ($access['lock_reason'] === 'CYCLE_LOCKED') {
            throw new HttpException(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
        }
        if ($access['lock_reason'] === 'DEADLINE_PASSED') {
            throw new HttpException(
                403,
                'DEADLINE_PASSED',
                'The submission deadline for this exam cycle has passed. Ask the Exam Cell to re-open it for your department.'
            );
        }
    }
}
