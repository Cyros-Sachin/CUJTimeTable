<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Csrf;
use App\Core\Db;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\AuditService;

class AuthController
{
    private static function requireCsrf(Request $request): void
    {
        if (!Csrf::verify($request)) {
            throw new HttpException(403, 'FORBIDDEN', 'Missing or invalid CSRF token');
        }
    }

    public function login(Request $request): void
    {
        self::requireCsrf($request);
        $data = Validator::validate($request->all(), [
            'email' => ['required', 'string', 'email'],
            'password' => ['required', 'string'],
        ]);

        $user = Auth::attempt(mb_strtolower($data['email']), (string) $request->input('password'), $request->ip);

        Response::json(self::userView($user));
    }

    public function logout(Request $request): void
    {
        self::requireCsrf($request);
        Auth::logout();
        Response::json(['ok' => true]);
    }

    public function me(Request $request): void
    {
        $user = Auth::user();
        if (!$user) {
            throw new HttpException(401, 'UNAUTHENTICATED', 'Not logged in');
        }
        Response::json(self::userView($user));
    }

    public function changePassword(Request $request): void
    {
        self::requireCsrf($request);
        $user = Auth::user();
        if (!$user) {
            throw new HttpException(401, 'UNAUTHENTICATED', 'Not logged in');
        }

        $data = Validator::validate($request->all(), [
            'current_password' => ['required', 'string'],
            'new_password' => ['required', 'string', 'min:10'],
        ]);

        $newPassword = (string) $request->input('new_password');
        if (!preg_match('/[A-Za-z]/', $newPassword) || !preg_match('/[0-9]/', $newPassword)) {
            throw new HttpException(422, 'VALIDATION', 'Validation failed', ['new_password' => 'Must contain at least one letter and one digit']);
        }

        $pdo = Db::conn();
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = :id');
        $stmt->execute(['id' => $user['id']]);
        $row = $stmt->fetch();

        if (!password_verify($data['current_password'], $row['password_hash'])) {
            throw new HttpException(422, 'VALIDATION', 'Current password is incorrect', ['current_password' => 'Incorrect password']);
        }

        $hash = Auth::hashPassword($newPassword);
        $upd = $pdo->prepare('UPDATE users SET password_hash = :hash, must_change_password = 0 WHERE id = :id');
        $upd->execute(['hash' => $hash, 'id' => $user['id']]);

        AuditService::log((int) $user['id'], 'PASSWORD_CHANGE', 'users', (string) $user['id'], null, $request->ip);

        Response::json(['ok' => true]);
    }

    private static function userView(array $user): array
    {
        return [
            'id' => (int) $user['id'],
            'name' => $user['name'],
            'email' => $user['email'],
            'role' => $user['role'],
            'department' => $user['department_id'] ? [
                'id' => (int) $user['department_id'],
                'name' => $user['department_name'],
                'code' => $user['department_code'],
            ] : null,
            'must_change_password' => (bool) $user['must_change_password'],
        ];
    }
}
