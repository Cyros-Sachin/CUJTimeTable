<?php

declare(strict_types=1);

namespace App\Core;

use App\Services\AuditService;

class Auth
{
    private const SESSION_KEY = 'user_id';
    private const MAX_ATTEMPTS = 10;
    private const WINDOW_MINUTES = 15;

    /** @var array<string,mixed>|null|false */
    private static array|null|false $cached = false;

    /** @return array<string,mixed>|null */
    public static function user(): ?array
    {
        if (self::$cached !== false) {
            return self::$cached;
        }

        $id = Session::get(self::SESSION_KEY);
        if (!$id) {
            self::$cached = null;
            return null;
        }

        $stmt = Db::conn()->prepare(
            'SELECT u.id, u.name, u.email, u.role, u.department_id, u.is_active, u.must_change_password,
                    d.name AS department_name, d.code AS department_code
             FROM users u LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.id = :id LIMIT 1'
        );
        $stmt->execute(['id' => $id]);
        $row = $stmt->fetch();

        if (!$row || !(int) $row['is_active']) {
            self::$cached = null;
            return null;
        }

        self::$cached = $row;
        return $row;
    }

    public static function isLoggedIn(): bool
    {
        return self::user() !== null;
    }

    public static function requireLogin(): array
    {
        $user = self::user();
        if ($user === null) {
            throw new HttpException(401, 'UNAUTHENTICATED', 'Not logged in');
        }
        if ((int) $user['must_change_password'] === 1) {
            throw new HttpException(403, 'PASSWORD_CHANGE_REQUIRED', 'Password change required before continuing');
        }
        return $user;
    }

    public static function requireRole(string $role): array
    {
        $user = self::requireLogin();
        if ($user['role'] !== $role) {
            throw new HttpException(403, 'FORBIDDEN', 'Not allowed for this role');
        }
        return $user;
    }

    public static function checkLoginThrottle(string $ip): void
    {
        $stmt = Db::conn()->prepare(
            "SELECT COUNT(*) AS c FROM audit_logs
             WHERE action = 'LOGIN_FAILED' AND ip = :ip AND created_at >= DATE_SUB(NOW(), INTERVAL :mins MINUTE)"
        );
        $stmt->execute(['ip' => $ip, 'mins' => self::WINDOW_MINUTES]);
        $row = $stmt->fetch();
        if ((int) $row['c'] >= self::MAX_ATTEMPTS) {
            throw new HttpException(429, 'RATE_LIMIT', 'Too many login attempts. Try again later.');
        }
    }

    public static function attempt(string $email, string $password, string $ip): array
    {
        self::checkLoginThrottle($ip);

        $stmt = Db::conn()->prepare(
            'SELECT u.*, d.name AS department_name, d.code AS department_code
             FROM users u LEFT JOIN departments d ON d.id = u.department_id
             WHERE u.email = :email LIMIT 1'
        );
        $stmt->execute(['email' => $email]);
        $row = $stmt->fetch();

        if (!$row || !(int) $row['is_active'] || !password_verify($password, $row['password_hash'])) {
            AuditService::log(null, 'LOGIN_FAILED', 'users', null, ['email' => $email], $ip);
            throw new HttpException(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
        }

        Session::regenerate();
        Session::set(self::SESSION_KEY, (int) $row['id']);
        self::$cached = false;

        $upd = Db::conn()->prepare('UPDATE users SET last_login_at = NOW() WHERE id = :id');
        $upd->execute(['id' => $row['id']]);

        AuditService::log((int) $row['id'], 'LOGIN', 'users', (string) $row['id'], null, $ip);

        return self::user();
    }

    public static function logout(): void
    {
        $user = self::user();
        if ($user) {
            AuditService::log((int) $user['id'], 'LOGOUT', 'users', (string) $user['id'], null, $_SERVER['REMOTE_ADDR'] ?? null);
        }
        Session::destroy();
        self::$cached = false;
    }

    public static function hashPassword(string $plain): string
    {
        return password_hash($plain, PASSWORD_DEFAULT);
    }
}
