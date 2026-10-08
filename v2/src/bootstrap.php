<?php

declare(strict_types=1);

use App\Core\Auth;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;
use App\Core\Session;

require __DIR__ . '/../vendor/autoload.php';
require __DIR__ . '/helpers.php';

date_default_timezone_set('Asia/Kolkata');

// Only escalate genuinely fatal-class errors to exceptions. Vendor code (mPDF's
// font parser in particular) routinely trips harmless E_WARNING/E_NOTICE level
// issues — e.g. reading an uninitialized string offset while walking a font's
// GSUB table — that PHP itself tolerates and recovers from. Throwing on those
// turned a working PDF render into a 500. Warnings/notices still reach the log
// via php.ini's log_errors, they just no longer abort the request.
const FATAL_ERROR_SEVERITIES = E_ERROR | E_CORE_ERROR | E_COMPILE_ERROR | E_USER_ERROR | E_RECOVERABLE_ERROR | E_PARSE;

set_error_handler(static function (int $severity, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $severity)) {
        return false;
    }
    if ($severity & FATAL_ERROR_SEVERITIES) {
        throw new \ErrorException($message, 0, $severity, $file, $line);
    }
    error_log("[warning] {$message} in {$file}:{$line}");
    return true;
});

Session::start();

$request = new Request();
$router = new Router();
require __DIR__ . '/routes.php';

try {
    $router->dispatch($request);
} catch (HttpException $e) {
    if ($request->isApi()) {
        Response::error($e);
    }

    if ($e->status === 401) {
        Response::redirect('/login');
    }
    if ($e->status === 403) {
        Response::forbiddenPage();
    }
    if ($e->status === 404) {
        Response::notFoundPage();
    }
    http_response_code($e->status);
    echo htmlspecialchars($e->getMessage(), ENT_QUOTES, 'UTF-8');
} catch (\Throwable $e) {
    error_log('[unhandled] ' . $e->getMessage() . "\n" . $e->getTraceAsString());

    if ($request->isApi()) {
        Response::error(new HttpException(500, 'INTERNAL', 'Something went wrong. Please try again.'));
    }

    http_response_code(500);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!doctype html><html><body style="font-family:sans-serif;text-align:center;padding:4rem"><h1>500</h1><p>Something went wrong. Please try again.</p></body></html>';
}
