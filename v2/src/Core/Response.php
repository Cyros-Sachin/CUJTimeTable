<?php

declare(strict_types=1);

namespace App\Core;

class Response
{
    public static function json(mixed $data, int $status = 200, array $meta = []): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        $payload = ['data' => $data];
        if ($meta) {
            $payload['meta'] = $meta;
        }
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function error(HttpException $e): never
    {
        http_response_code($e->status);
        header('Content-Type: application/json; charset=utf-8');
        $error = ['code' => $e->errorCode, 'message' => $e->getMessage()];
        if ($e->fields !== null) {
            $error['fields'] = $e->fields;
        }
        echo json_encode(['error' => $error], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function redirect(string $to, int $status = 302): never
    {
        http_response_code($status);
        header('Location: ' . $to);
        exit;
    }

    public static function html(string $html, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        echo $html;
        exit;
    }

    public static function notFoundPage(): never
    {
        http_response_code(404);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:4rem"><h1>404</h1><p>Page not found.</p><a href="/">Go home</a></body></html>';
        exit;
    }

    public static function forbiddenPage(): never
    {
        http_response_code(403);
        header('Content-Type: text/html; charset=utf-8');
        echo '<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:4rem"><h1>403</h1><p>You are not allowed to view this page.</p><a href="/">Go home</a></body></html>';
        exit;
    }

    public static function streamPdf(string $binary, string $filename, bool $download): never
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: application/pdf');
        header('Content-Disposition: ' . ($download ? 'attachment' : 'inline') . '; filename="' . $filename . '"');
        header('Cache-Control: no-store');
        header('Content-Length: ' . strlen($binary));
        echo $binary;
        exit;
    }

    public static function streamBinary(string $binary, string $filename, string $contentType): never
    {
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: ' . $contentType);
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Cache-Control: no-store');
        header('Content-Length: ' . strlen($binary));
        echo $binary;
        exit;
    }
}
