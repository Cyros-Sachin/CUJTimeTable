<?php

declare(strict_types=1);

namespace App\Core;

class Csrf
{
    private const SESSION_KEY = '_csrf_token';

    public static function token(): string
    {
        $token = Session::get(self::SESSION_KEY);
        if (!is_string($token)) {
            $token = bin2hex(random_bytes(32));
            Session::set(self::SESSION_KEY, $token);
        }
        return $token;
    }

    public static function verify(Request $request): bool
    {
        $expected = Session::get(self::SESSION_KEY);
        if (!is_string($expected)) {
            return false;
        }
        $given = $request->header('X-CSRF-Token') ?? (string) $request->input('_csrf', '');
        return $given !== '' && hash_equals($expected, $given);
    }
}
