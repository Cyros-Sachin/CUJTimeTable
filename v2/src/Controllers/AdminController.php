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

class AdminController
{
    private function user(): array
    {
        return Auth::requireRole('EXAM_CELL');
    }

    private function audit(string $action, string $entity, ?string $entityId, ?array $details, Request $request): void
    {
        $user = $this->user();
        AuditService::log((int) $user['id'], $action, $entity, $entityId, $details, $request->ip);
    }

    // ---- Departments ------------------------------------------------------
    public function listDepartments(Request $request): void
    {
        $this->user();
        $rows = Db::conn()->query('SELECT * FROM departments ORDER BY name')->fetchAll();
        Response::json($rows);
    }

    public function createDepartment(Request $request): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['code' => ['required', 'string', 'max:20'], 'name' => ['required', 'string', 'max:200']]);
        $stmt = Db::conn()->prepare('INSERT INTO departments (code, name) VALUES (:code, :name)');
        $stmt->execute($data);
        $id = (int) Db::conn()->lastInsertId();
        $this->audit('ADMIN_CREATE', 'departments', (string) $id, $data, $request);
        Response::json(['id' => $id] + $data, 201);
    }

    public function updateDepartment(Request $request, array $params): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['code' => ['string', 'max:20'], 'name' => ['string', 'max:200'], 'is_active' => ['bool']]);
        if (!$data) {
            throw new HttpException(400, 'BAD_REQUEST', 'No fields to update');
        }
        self::runUpdate('departments', (int) $params['id'], $data);
        $this->audit('ADMIN_UPDATE', 'departments', $params['id'], $data, $request);
        Response::json(['ok' => true]);
    }

    public function deleteDepartment(Request $request, array $params): void
    {
        $this->user();
        $id = (int) $params['id'];
        $inUse = self::count('SELECT COUNT(*) AS c FROM programs WHERE department_id = :id', ['id' => $id]);
        if ($inUse > 0) {
            self::runUpdate('departments', $id, ['is_active' => false]);
        } else {
            $stmt = Db::conn()->prepare('DELETE FROM departments WHERE id = :id');
            $stmt->execute(['id' => $id]);
        }
        $this->audit('ADMIN_DELETE', 'departments', $params['id'], null, $request);
        Response::json(['ok' => true]);
    }

    // ---- Programs -----------------------------------------------------
    public function listPrograms(Request $request): void
    {
        $this->user();
        $rows = Db::conn()->query('SELECT p.*, d.name AS department_name FROM programs p JOIN departments d ON d.id = p.department_id ORDER BY d.name, p.name')->fetchAll();
        Response::json($rows);
    }

    public function createProgram(Request $request): void
    {
        $this->user();
        $data = Validator::validate($request->all(), [
            'department_id' => ['required', 'int', 'min:1'],
            'code' => ['required', 'string', 'max:30'],
            'name' => ['required', 'string', 'max:200'],
            'total_semesters' => ['required', 'int', 'min:1', 'max:20'],
        ]);
        $stmt = Db::conn()->prepare('INSERT INTO programs (department_id, code, name, total_semesters) VALUES (:department_id, :code, :name, :total_semesters)');
        $stmt->execute($data);
        $id = (int) Db::conn()->lastInsertId();
        $this->audit('ADMIN_CREATE', 'programs', (string) $id, $data, $request);
        Response::json(['id' => $id] + $data, 201);
    }

    public function updateProgram(Request $request, array $params): void
    {
        $this->user();
        $data = Validator::validate($request->all(), [
            'department_id' => ['int', 'min:1'], 'code' => ['string', 'max:30'],
            'name' => ['string', 'max:200'], 'total_semesters' => ['int', 'min:1', 'max:20'], 'is_active' => ['bool'],
        ]);
        if (!$data) {
            throw new HttpException(400, 'BAD_REQUEST', 'No fields to update');
        }
        self::runUpdate('programs', (int) $params['id'], $data);
        $this->audit('ADMIN_UPDATE', 'programs', $params['id'], $data, $request);
        Response::json(['ok' => true]);
    }

    public function deleteProgram(Request $request, array $params): void
    {
        $this->user();
        $id = (int) $params['id'];
        $inUse = self::count('SELECT COUNT(*) AS c FROM exam_entries WHERE program_id = :id', ['id' => $id]);
        if ($inUse > 0) {
            self::runUpdate('programs', $id, ['is_active' => false]);
        } else {
            $stmt = Db::conn()->prepare('DELETE FROM programs WHERE id = :id');
            $stmt->execute(['id' => $id]);
        }
        $this->audit('ADMIN_DELETE', 'programs', $params['id'], null, $request);
        Response::json(['ok' => true]);
    }

    // ---- Subject types --------------------------------------------------
    public function listSubjectTypes(Request $request): void
    {
        $this->user();
        Response::json(Db::conn()->query('SELECT * FROM subject_types ORDER BY id')->fetchAll());
    }

    public function createSubjectType(Request $request): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['name' => ['required', 'string', 'max:100']]);
        $stmt = Db::conn()->prepare('INSERT INTO subject_types (name) VALUES (:name)');
        $stmt->execute($data);
        $id = (int) Db::conn()->lastInsertId();
        $this->audit('ADMIN_CREATE', 'subject_types', (string) $id, $data, $request);
        Response::json(['id' => $id] + $data, 201);
    }

    public function updateSubjectType(Request $request, array $params): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['name' => ['string', 'max:100'], 'is_active' => ['bool']]);
        if (!$data) {
            throw new HttpException(400, 'BAD_REQUEST', 'No fields to update');
        }
        self::runUpdate('subject_types', (int) $params['id'], $data);
        $this->audit('ADMIN_UPDATE', 'subject_types', $params['id'], $data, $request);
        Response::json(['ok' => true]);
    }

    public function deleteSubjectType(Request $request, array $params): void
    {
        $this->user();
        $id = (int) $params['id'];
        $inUse = self::count('SELECT COUNT(*) AS c FROM exam_entries WHERE subject_type_id = :id', ['id' => $id]);
        if ($inUse > 0) {
            self::runUpdate('subject_types', $id, ['is_active' => false]);
        } else {
            $stmt = Db::conn()->prepare('DELETE FROM subject_types WHERE id = :id');
            $stmt->execute(['id' => $id]);
        }
        $this->audit('ADMIN_DELETE', 'subject_types', $params['id'], null, $request);
        Response::json(['ok' => true]);
    }

    // ---- Time slots -------------------------------------------------------
    public function listTimeSlots(Request $request): void
    {
        $this->user();
        Response::json(Db::conn()->query('SELECT * FROM time_slots ORDER BY start_time')->fetchAll());
    }

    public function createTimeSlot(Request $request): void
    {
        $this->user();
        $data = Validator::validate($request->all(), [
            'label' => ['required', 'string', 'max:30'],
            'start_time' => ['required', 'string'],
            'end_time' => ['required', 'string'],
        ]);
        $stmt = Db::conn()->prepare('INSERT INTO time_slots (label, start_time, end_time) VALUES (:label, :start_time, :end_time)');
        $stmt->execute($data);
        $id = (int) Db::conn()->lastInsertId();
        $this->audit('ADMIN_CREATE', 'time_slots', (string) $id, $data, $request);
        Response::json(['id' => $id] + $data, 201);
    }

    public function updateTimeSlot(Request $request, array $params): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['label' => ['string', 'max:30'], 'start_time' => ['string'], 'end_time' => ['string'], 'is_active' => ['bool']]);
        if (!$data) {
            throw new HttpException(400, 'BAD_REQUEST', 'No fields to update');
        }
        self::runUpdate('time_slots', (int) $params['id'], $data);
        $this->audit('ADMIN_UPDATE', 'time_slots', $params['id'], $data, $request);
        Response::json(['ok' => true]);
    }

    public function deleteTimeSlot(Request $request, array $params): void
    {
        $this->user();
        $id = (int) $params['id'];
        $inUse = self::count('SELECT COUNT(*) AS c FROM exam_entries WHERE time_slot_id = :id', ['id' => $id]);
        if ($inUse > 0) {
            self::runUpdate('time_slots', $id, ['is_active' => false]);
        } else {
            $stmt = Db::conn()->prepare('DELETE FROM time_slots WHERE id = :id');
            $stmt->execute(['id' => $id]);
        }
        $this->audit('ADMIN_DELETE', 'time_slots', $params['id'], null, $request);
        Response::json(['ok' => true]);
    }

    // ---- Academic sessions -------------------------------------------
    public function listSessions(Request $request): void
    {
        $this->user();
        Response::json(Db::conn()->query('SELECT * FROM academic_sessions ORDER BY label DESC')->fetchAll());
    }

    public function createSession(Request $request): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['label' => ['required', 'string', 'max:20'], 'is_current' => ['bool']]);
        $pdo = Db::conn();
        if (!empty($data['is_current'])) {
            $pdo->exec('UPDATE academic_sessions SET is_current = 0');
        }
        $stmt = $pdo->prepare('INSERT INTO academic_sessions (label, is_current) VALUES (:label, :is_current)');
        $stmt->execute(['label' => $data['label'], 'is_current' => !empty($data['is_current']) ? 1 : 0]);
        $id = (int) $pdo->lastInsertId();
        $this->audit('ADMIN_CREATE', 'academic_sessions', (string) $id, $data, $request);
        Response::json(['id' => $id] + $data, 201);
    }

    public function updateSession(Request $request, array $params): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['label' => ['string', 'max:20'], 'is_current' => ['bool']]);
        if (!$data) {
            throw new HttpException(400, 'BAD_REQUEST', 'No fields to update');
        }
        if (!empty($data['is_current'])) {
            Db::conn()->exec('UPDATE academic_sessions SET is_current = 0');
        }
        self::runUpdate('academic_sessions', (int) $params['id'], $data);
        $this->audit('ADMIN_UPDATE', 'academic_sessions', $params['id'], $data, $request);
        Response::json(['ok' => true]);
    }

    public function deleteSession(Request $request, array $params): void
    {
        $this->user();
        $id = (int) $params['id'];
        $inUse = self::count('SELECT COUNT(*) AS c FROM exam_cycles WHERE academic_session_id = :id', ['id' => $id]);
        if ($inUse > 0) {
            throw new HttpException(409, 'IN_USE', 'Session has exam cycles; cannot delete');
        }
        $stmt = Db::conn()->prepare('DELETE FROM academic_sessions WHERE id = :id');
        $stmt->execute(['id' => $id]);
        $this->audit('ADMIN_DELETE', 'academic_sessions', $params['id'], null, $request);
        Response::json(['ok' => true]);
    }

    // ---- Exam cycles ----------------------------------------------------
    public function listCycles(Request $request): void
    {
        $this->user();
        $rows = Db::conn()->query('
            SELECT c.*, s.label AS session_label FROM exam_cycles c
            JOIN academic_sessions s ON s.id = c.academic_session_id ORDER BY c.start_date DESC
        ')->fetchAll();
        Response::json($rows);
    }

    public function createCycle(Request $request): void
    {
        $this->user();
        $data = Validator::validate($request->all(), [
            'academic_session_id' => ['required', 'int', 'min:1'],
            'title' => ['required', 'string', 'max:150'],
            'month_year' => ['required', 'string', 'max:30'],
            'start_date' => ['required', 'date'],
            'end_date' => ['required', 'date'],
        ]);
        if ($data['end_date'] < $data['start_date']) {
            throw new HttpException(422, 'VALIDATION', 'end_date must be on or after start_date', ['end_date' => 'Must be after start date']);
        }
        $stmt = Db::conn()->prepare(
            'INSERT INTO exam_cycles (academic_session_id, title, month_year, start_date, end_date)
             VALUES (:academic_session_id, :title, :month_year, :start_date, :end_date)'
        );
        $stmt->execute($data);
        $id = (int) Db::conn()->lastInsertId();
        $this->audit('ADMIN_CREATE', 'exam_cycles', (string) $id, $data, $request);
        Response::json(['id' => $id, 'status' => 'OPEN'] + $data, 201);
    }

    public function updateCycle(Request $request, array $params): void
    {
        $this->user();
        $data = Validator::validate($request->all(), [
            'academic_session_id' => ['int', 'min:1'], 'title' => ['string', 'max:150'],
            'month_year' => ['string', 'max:30'], 'start_date' => ['date'], 'end_date' => ['date'],
        ]);
        if (!$data) {
            throw new HttpException(400, 'BAD_REQUEST', 'No fields to update');
        }
        self::runUpdate('exam_cycles', (int) $params['id'], $data);
        $this->audit('ADMIN_UPDATE', 'exam_cycles', $params['id'], $data, $request);
        Response::json(['ok' => true]);
    }

    public function setCycleStatus(Request $request, array $params): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['status' => ['required', 'string', 'in:OPEN,LOCKED']]);
        $stmt = Db::conn()->prepare('UPDATE exam_cycles SET status = :status WHERE id = :id');
        $stmt->execute(['status' => $data['status'], 'id' => $params['id']]);
        $this->audit('ADMIN_CYCLE_STATUS', 'exam_cycles', $params['id'], $data, $request);
        Response::json(['ok' => true]);
    }

    // ---- Users --------------------------------------------------------
    public function listUsers(Request $request): void
    {
        $this->user();
        $rows = Db::conn()->query('
            SELECT u.id, u.name, u.email, u.role, u.department_id, d.name AS department_name,
                   u.is_active, u.must_change_password, u.last_login_at, u.created_at
            FROM users u LEFT JOIN departments d ON d.id = u.department_id ORDER BY u.role, u.name
        ')->fetchAll();
        Response::json($rows);
    }

    public function createUser(Request $request): void
    {
        $this->user();
        $data = Validator::validate($request->all(), [
            'name' => ['required', 'string', 'max:120'],
            'email' => ['required', 'string', 'email', 'max:160'],
            'department_id' => ['required', 'int', 'min:1'],
            'password' => ['string', 'min:10'],
        ]);
        if (isset($data['password']) && (!preg_match('/[A-Za-z]/', $data['password']) || !preg_match('/[0-9]/', $data['password']))) {
            throw new HttpException(422, 'VALIDATION', 'Validation failed', ['password' => 'Must contain at least one letter and one digit']);
        }
        $tempPassword = $data['password'] ?? self::randomPassword();
        $hash = Auth::hashPassword($tempPassword);
        $stmt = Db::conn()->prepare(
            "INSERT INTO users (name, email, password_hash, role, department_id, must_change_password)
             VALUES (:name, :email, :hash, 'DEPT_COORDINATOR', :department_id, 1)"
        );
        $stmt->execute(['name' => $data['name'], 'email' => mb_strtolower($data['email']), 'hash' => $hash, 'department_id' => $data['department_id']]);
        $id = (int) Db::conn()->lastInsertId();
        $this->audit('ADMIN_CREATE', 'users', (string) $id, ['name' => $data['name'], 'email' => $data['email']], $request);
        Response::json(['id' => $id, 'name' => $data['name'], 'email' => $data['email'], 'temp_password' => $tempPassword], 201);
    }

    public function updateUser(Request $request, array $params): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['name' => ['string', 'max:120'], 'is_active' => ['bool']]);
        if (!$data) {
            throw new HttpException(400, 'BAD_REQUEST', 'No fields to update');
        }
        $sets = implode(', ', array_map(fn ($f) => "{$f} = :{$f}", array_keys($data)));
        $stmt = Db::conn()->prepare("UPDATE users SET {$sets} WHERE id = :id AND role = 'DEPT_COORDINATOR'");
        $stmt->execute($data + ['id' => $params['id']]);
        $this->audit('ADMIN_UPDATE', 'users', $params['id'], $data, $request);
        Response::json(['ok' => true]);
    }

    public function resetUserPassword(Request $request, array $params): void
    {
        $this->user();
        $tempPassword = self::randomPassword();
        $hash = Auth::hashPassword($tempPassword);
        $stmt = Db::conn()->prepare('UPDATE users SET password_hash = :hash, must_change_password = 1 WHERE id = :id');
        $stmt->execute(['hash' => $hash, 'id' => $params['id']]);
        $this->audit('ADMIN_RESET_PASSWORD', 'users', $params['id'], null, $request);
        Response::json(['temp_password' => $tempPassword]);
    }

    private static function randomPassword(): string
    {
        return 'Cuj#' . bin2hex(random_bytes(6)) . '9';
    }

    // ---- Branding -----------------------------------------------------
    public function getBranding(Request $request): void
    {
        $this->user();
        $rows = Db::conn()->query('SELECT k, v FROM settings')->fetchAll();
        $map = [];
        foreach ($rows as $row) {
            $map[$row['k']] = $row['v'];
        }
        Response::json($map);
    }

    public function updateBranding(Request $request): void
    {
        $this->user();
        $data = Validator::validate($request->all(), ['controller_name' => ['string', 'max:120'], 'controller_title' => ['string', 'max:120']]);
        $pdo = Db::conn();
        foreach ($data as $k => $v) {
            $stmt = $pdo->prepare('INSERT INTO settings (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = VALUES(v)');
            $stmt->execute(['k' => $k, 'v' => $v]);
        }
        $this->audit('ADMIN_UPDATE', 'settings', 'branding', $data, $request);
        Response::json(['ok' => true]);
    }

    public function uploadLogo(Request $request): void
    {
        $this->uploadBrandingImage($request, 'logo_path', 'logo');
    }

    public function uploadSignature(Request $request): void
    {
        $this->uploadBrandingImage($request, 'signature_path', 'signature');
    }

    private function uploadBrandingImage(Request $request, string $settingKey, string $baseName): void
    {
        $this->user();
        if (empty($_FILES['file']) || $_FILES['file']['error'] !== UPLOAD_ERR_OK) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'No file uploaded');
        }
        $file = $_FILES['file'];
        if ($file['size'] > 1024 * 1024) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'File must be under 1MB');
        }
        $finfo = finfo_open(FILEINFO_MIME_TYPE);
        $mime = finfo_file($finfo, $file['tmp_name']) ?: '';
        finfo_close($finfo);
        if (!in_array($mime, ['image/png', 'image/jpeg'], true)) {
            throw new HttpException(422, 'UPLOAD_INVALID', 'File must be a PNG or JPG image');
        }

        $ext = $mime === 'image/png' ? 'png' : 'jpg';
        $relPath = "{$baseName}.{$ext}";
        $dest = __DIR__ . '/../../storage/branding/' . $relPath;
        if (!move_uploaded_file($file['tmp_name'], $dest)) {
            throw new HttpException(500, 'INTERNAL', 'Could not save the uploaded file');
        }

        $stmt = Db::conn()->prepare('INSERT INTO settings (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = VALUES(v)');
        $stmt->execute(['k' => $settingKey, 'v' => $relPath]);
        $this->audit('ADMIN_UPLOAD_' . mb_strtoupper($baseName), 'settings', $settingKey, null, $request);
        Response::json(['ok' => true]);
    }

    // ---- Audit log -------------------------------------------------------
    public function auditLogs(Request $request): void
    {
        $this->user();
        $page = max(1, (int) ($request->queryParam('page', 1)));
        $pageSize = min(100, max(1, (int) ($request->queryParam('page_size', 50))));
        $offset = ($page - 1) * $pageSize;

        $pdo = Db::conn();
        $stmt = $pdo->prepare("
            SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_logs a
            LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT {$pageSize} OFFSET {$offset}
        ");
        $stmt->execute();
        $rows = $stmt->fetchAll();
        $total = (int) $pdo->query('SELECT COUNT(*) AS c FROM audit_logs')->fetch()['c'];

        Response::json($rows, 200, ['total' => $total, 'page' => $page, 'page_size' => $pageSize]);
    }

    private static function runUpdate(string $table, int $id, array $data): void
    {
        $sets = implode(', ', array_map(fn ($f) => "{$f} = :{$f}", array_keys($data)));
        $stmt = Db::conn()->prepare("UPDATE {$table} SET {$sets} WHERE id = :id");
        $stmt->execute($data + ['id' => $id]);
    }

    private static function count(string $sql, array $params): int
    {
        $stmt = Db::conn()->prepare($sql);
        $stmt->execute($params);
        return (int) $stmt->fetch()['c'];
    }
}
