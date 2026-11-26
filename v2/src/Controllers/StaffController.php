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
use App\Services\MasterImportService;

/** Admin > Staff: the invigilation duty pool (EXAM_CELL only). */
class StaffController
{
    private const RULES = [
        'employee_code' => ['string', 'max:30'],
        'name' => ['string', 'max:120'],
        'department_id' => ['int', 'min:1'],
        'designation' => ['string', 'max:100'],
        'email' => ['string', 'email', 'max:160'],
        'phone' => ['string', 'max:20'],
    ];

    public function index(Request $request): void
    {
        Auth::requireRole('EXAM_CELL');
        $rows = Db::conn()->query(
            'SELECT s.*, d.name AS department_name,
                    (SELECT COUNT(*) FROM duty_assignments a WHERE a.staff_id = s.id) AS duty_count
             FROM staff s LEFT JOIN departments d ON d.id = s.department_id
             ORDER BY s.is_active DESC, d.name IS NULL, d.name, s.name'
        )->fetchAll();
        Response::json($rows);
    }

    public function template(Request $request): void
    {
        Auth::requireRole('EXAM_CELL');
        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx(MasterImportService::staffTemplate());
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="Staff_Template.xlsx"');
        $writer->save('php://output');
        exit;
    }

    public function import(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $dryRun = (string) $request->input('dry_run', 'false') === 'true';
        $result = MasterImportService::importStaff($_FILES['file'] ?? [], $dryRun);
        if (!$dryRun) {
            AuditService::log((int) $user['id'], 'ADMIN_BULK_IMPORT', 'staff', null, ['inserted' => $result['inserted'], 'skipped' => $result['skipped']], $request->ip);
        }
        Response::json($result, $dryRun ? 200 : 201);
    }

    public function create(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $rules = self::RULES;
        $rules['employee_code'][] = 'required';
        $rules['name'][] = 'required';
        $data = self::normalize(Validator::validate($request->all(), $rules), true);
        self::assertDepartment($data['department_id']);
        self::assertUniqueCode($data['employee_code'], null);

        $stmt = Db::conn()->prepare(
            'INSERT INTO staff (employee_code, name, department_id, designation, email, phone)
             VALUES (:employee_code, :name, :department_id, :designation, :email, :phone)'
        );
        $stmt->execute($data);
        $id = (int) Db::conn()->lastInsertId();
        AuditService::log((int) $user['id'], 'ADMIN_CREATE', 'staff', (string) $id, $data, $request->ip);
        Response::json(['id' => $id] + $data, 201);
    }

    public function update(Request $request, array $params): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $id = (int) $params['id'];
        self::find($id);
        $body = $request->all();
        $data = self::normalize(Validator::validate($body, self::RULES + ['is_active' => ['bool']]), false);
        // Optional fields sent as '' mean "clear it"; the validator drops empty values, so restore them as NULL.
        foreach (['department_id', 'designation', 'email', 'phone'] as $f) {
            if (array_key_exists($f, $body) && ($body[$f] === '' || $body[$f] === null)) {
                $data[$f] = null;
            }
        }
        if (!$data) {
            throw new HttpException(400, 'BAD_REQUEST', 'No fields to update');
        }
        if (array_key_exists('department_id', $data)) {
            self::assertDepartment($data['department_id']);
        }
        if (isset($data['employee_code'])) {
            self::assertUniqueCode($data['employee_code'], $id);
        }
        $sets = implode(', ', array_map(fn ($f) => "{$f} = :{$f}", array_keys($data)));
        Db::conn()->prepare("UPDATE staff SET {$sets} WHERE id = :id")->execute($data + ['id' => $id]);
        AuditService::log((int) $user['id'], 'ADMIN_UPDATE', 'staff', (string) $id, $data, $request->ip);
        Response::json(['ok' => true]);
    }

    /** Staff with duty history are deactivated (history and letters stay intact); others are deleted. */
    public function destroy(Request $request, array $params): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $id = (int) $params['id'];
        self::find($id);
        $pdo = Db::conn();
        $stmt = $pdo->prepare('SELECT COUNT(*) AS c FROM duty_assignments WHERE staff_id = :id');
        $stmt->execute(['id' => $id]);
        $deactivated = (int) $stmt->fetch()['c'] > 0;
        if ($deactivated) {
            $pdo->prepare('UPDATE staff SET is_active = 0 WHERE id = :id')->execute(['id' => $id]);
        } else {
            $pdo->prepare('DELETE FROM staff WHERE id = :id')->execute(['id' => $id]);
        }
        AuditService::log((int) $user['id'], 'ADMIN_DELETE', 'staff', (string) $id, ['deactivated' => $deactivated], $request->ip);
        Response::json(['ok' => true, 'deactivated' => $deactivated]);
    }

    private static function normalize(array $data, bool $fill): array
    {
        if (isset($data['email'])) {
            $data['email'] = mb_strtolower($data['email']);
        }
        if ($fill) {
            $data += ['department_id' => null, 'designation' => null, 'email' => null, 'phone' => null];
        }
        return $data;
    }

    private static function find(int $id): array
    {
        $stmt = Db::conn()->prepare('SELECT * FROM staff WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new HttpException(404, 'NOT_FOUND', 'Staff member not found');
        }
        return $row;
    }

    private static function assertDepartment(?int $departmentId): void
    {
        if ($departmentId === null) {
            return;
        }
        $stmt = Db::conn()->prepare('SELECT id FROM departments WHERE id = :id AND is_active = 1');
        $stmt->execute(['id' => $departmentId]);
        if (!$stmt->fetch()) {
            throw new HttpException(422, 'VALIDATION', 'Validation failed', ['department_id' => 'Unknown department']);
        }
    }

    private static function assertUniqueCode(string $code, ?int $exceptId): void
    {
        $stmt = Db::conn()->prepare('SELECT id FROM staff WHERE employee_code = :c AND id <> :id');
        $stmt->execute(['c' => $code, 'id' => $exceptId ?? 0]);
        if ($stmt->fetch()) {
            throw new HttpException(422, 'VALIDATION', 'Validation failed', ['employee_code' => 'This employee code already exists']);
        }
    }
}
