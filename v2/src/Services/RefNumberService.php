<?php

declare(strict_types=1);

namespace App\Services;

use PDO;

class RefNumberService
{
    /**
     * Must be called inside a transaction. Allocates the reference number
     * once per (cycle, program, semester, exam_type) and freezes the issue
     * date on first generation; every later PDF request returns the same
     * stored row.
     *
     * @return array{ref_no:string, issued_on:string}
     */
    public static function getOrCreate(PDO $pdo, int $cycleId, int $programId, int $semester, string $examType): array
    {
        $select = $pdo->prepare(
            'SELECT ref_no, issued_on FROM datesheet_refs
             WHERE exam_cycle_id = :cycle AND program_id = :prog AND semester = :sem AND exam_type = :type
             FOR UPDATE'
        );
        $select->execute(['cycle' => $cycleId, 'prog' => $programId, 'sem' => $semester, 'type' => $examType]);
        $existing = $select->fetch();
        if ($existing) {
            return ['ref_no' => $existing['ref_no'], 'issued_on' => $existing['issued_on']];
        }

        $year = (int) date('Y');
        $maxStmt = $pdo->prepare('SELECT COALESCE(MAX(ref_seq), 0) AS maxSeq FROM datesheet_refs WHERE ref_year = :year FOR UPDATE');
        $maxStmt->execute(['year' => $year]);
        $max = (int) $maxStmt->fetch()['maxSeq'];

        $refSeqStart = (int) (getenv('REF_SEQ_START') ?: 3000);
        $seq = max($max + 1, $refSeqStart);
        $refNo = "CUJ/Exam/Datesheet/{$year}/{$seq}";

        try {
            $insert = $pdo->prepare(
                'INSERT INTO datesheet_refs (exam_cycle_id, program_id, semester, exam_type, ref_year, ref_seq, ref_no, issued_on)
                 VALUES (:cycle, :prog, :sem, :type, :year, :seq, :refNo, CURDATE())'
            );
            $insert->execute([
                'cycle' => $cycleId, 'prog' => $programId, 'sem' => $semester, 'type' => $examType,
                'year' => $year, 'seq' => $seq, 'refNo' => $refNo,
            ]);
        } catch (\PDOException $e) {
            if ($e->getCode() === '23000') {
                $retry = $pdo->prepare(
                    'SELECT ref_no, issued_on FROM datesheet_refs
                     WHERE exam_cycle_id = :cycle AND program_id = :prog AND semester = :sem AND exam_type = :type
                     FOR UPDATE'
                );
                $retry->execute(['cycle' => $cycleId, 'prog' => $programId, 'sem' => $semester, 'type' => $examType]);
                $row = $retry->fetch();
                if ($row) {
                    return ['ref_no' => $row['ref_no'], 'issued_on' => $row['issued_on']];
                }
            }
            throw $e;
        }

        $issuedStmt = $pdo->prepare('SELECT issued_on FROM datesheet_refs WHERE ref_no = :refNo LIMIT 1');
        $issuedStmt->execute(['refNo' => $refNo]);
        $issuedOn = $issuedStmt->fetch()['issued_on'];

        return ['ref_no' => $refNo, 'issued_on' => $issuedOn];
    }
}
