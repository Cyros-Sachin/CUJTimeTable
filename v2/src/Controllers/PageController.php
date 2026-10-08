<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Request;
use App\Core\Response;
use App\Core\View;

class PageController
{
    public function home(Request $request): void
    {
        $user = Auth::user();
        if (!$user) {
            Response::redirect('/login');
        }
        if ((int) $user['must_change_password'] === 1) {
            Response::redirect('/change-password');
        }
        Response::redirect('/dashboard');
    }

    public function login(Request $request): void
    {
        $user = Auth::user();
        if ($user) {
            Response::redirect((int) $user['must_change_password'] === 1 ? '/change-password' : '/dashboard');
        }
        Response::html(View::render('login', ['pageTitle' => 'Login'], false));
    }

    public function changePassword(Request $request): void
    {
        $user = Auth::user();
        if (!$user) {
            Response::redirect('/login');
        }
        Response::html(View::render('change-password', ['pageTitle' => 'Change Password', 'forced' => (int) $user['must_change_password'] === 1], false));
    }

    public function dashboard(Request $request): void
    {
        $user = self::requirePageLogin();
        Response::html(View::render('dashboard', ['pageTitle' => 'Dashboard', 'activeNav' => 'dashboard', 'user' => $user]));
    }

    public function entryForm(Request $request, array $params): void
    {
        $user = self::requirePageLogin();
        $entryId = $params['id'] ?? null;
        Response::html(View::render('entry-form', [
            'pageTitle' => $entryId ? 'Edit Entry' : 'Add Entry',
            'activeNav' => 'entries',
            'user' => $user,
            'entryId' => $entryId,
        ]));
    }

    public function datesheets(Request $request): void
    {
        $user = self::requirePageLogin();
        Response::html(View::render('datesheet', ['pageTitle' => 'Date Sheet', 'activeNav' => 'datesheets', 'user' => $user]));
    }

    public function consolidated(Request $request): void
    {
        $user = self::requirePageLogin();
        if ($user['role'] !== 'EXAM_CELL') {
            Response::forbiddenPage();
        }
        Response::html(View::render('consolidated', ['pageTitle' => 'Consolidated', 'activeNav' => 'consolidated', 'user' => $user]));
    }

    public function admin(Request $request, array $params): void
    {
        $user = self::requirePageLogin();
        if ($user['role'] !== 'EXAM_CELL') {
            Response::forbiddenPage();
        }
        $tab = $params['tab'] ?? 'departments';
        Response::html(View::render('admin', ['pageTitle' => 'Admin', 'activeNav' => 'admin', 'user' => $user, 'tab' => $tab]));
    }

    public function logout(Request $request): void
    {
        Auth::logout();
        Response::redirect('/login');
    }

    private static function requirePageLogin(): array
    {
        $user = Auth::user();
        if (!$user) {
            Response::redirect('/login');
        }
        if ((int) $user['must_change_password'] === 1) {
            Response::redirect('/change-password');
        }
        return $user;
    }
}
