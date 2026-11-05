<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\HttpException;
use PDO;

class ClashService
{
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
