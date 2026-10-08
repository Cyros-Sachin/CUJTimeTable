<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\HttpException;
use PDO;

class ClashService
{
    private const TYPE_LABEL = ['REGULAR' => 'Regular', 'REAPPEAR' => 'Re-appear'];

    /**
     * Must run inside the same transaction/connection as the insert/update
     * that follows it, so the FOR UPDATE row lock actually prevents a second
     * concurrent request from slipping an identical slot in before this one
     * commits.
     */
    public static function assertNoClash(
        PDO $pdo,
        int $cycleId,
        int $programId,
        string $programName,
        int $semester,
        string $examType,
        string $date,
        int $slotId,
        ?int $excludeId = null,
    ): void {
        $stmt = $pdo->prepare(
            'SELECT e.id, e.course_name, ts.label FROM exam_entries e
             JOIN time_slots ts ON ts.id = e.time_slot_id
             WHERE e.exam_cycle_id = :cycle AND e.program_id = :prog AND e.semester = :sem
               AND e.exam_type = :type AND e.exam_date = :dt AND e.time_slot_id = :slot
               AND e.id <> :self LIMIT 1 FOR UPDATE'
        );
        $stmt->execute([
            'cycle' => $cycleId, 'prog' => $programId, 'sem' => $semester, 'type' => $examType,
            'dt' => $date, 'slot' => $slotId, 'self' => $excludeId ?? 0,
        ]);
        $row = $stmt->fetch();

        if ($row) {
            [$y, $m, $d] = explode('-', $date);
            $ddmmyyyy = "{$d}-{$m}-{$y}";
            $typeLabel = self::TYPE_LABEL[$examType];
            throw new HttpException(
                409,
                'CLASH',
                "Clash: {$programName} Semester {$semester} ({$typeLabel}) already has \"{$row['course_name']}\" on {$ddmmyyyy} at {$row['label']}.",
                ['exam_date' => 'This date and time slot is already used.'],
            );
        }
    }

    public static function assertNoDuplicateCourse(
        PDO $pdo,
        int $cycleId,
        int $programId,
        int $semester,
        string $examType,
        string $courseCode,
        ?int $excludeId = null,
    ): void {
        $stmt = $pdo->prepare(
            'SELECT id FROM exam_entries
             WHERE exam_cycle_id = :cycle AND program_id = :prog AND semester = :sem
               AND exam_type = :type AND course_code = :code AND id <> :self LIMIT 1 FOR UPDATE'
        );
        $stmt->execute([
            'cycle' => $cycleId, 'prog' => $programId, 'sem' => $semester, 'type' => $examType,
            'code' => $courseCode, 'self' => $excludeId ?? 0,
        ]);

        if ($stmt->fetch()) {
            throw new HttpException(
                409,
                'DUPLICATE_COURSE',
                "Course code \"{$courseCode}\" already exists for this program, semester and exam type.",
                ['course_code' => 'Duplicate course code for this program/semester/type.'],
            );
        }
    }
}
