<?php

declare(strict_types=1);

use App\Controllers\AdminController;
use App\Controllers\AuthController;
use App\Controllers\ConsolidatedController;
use App\Controllers\DashboardController;
use App\Controllers\DateSheetController;
use App\Controllers\EntryController;
use App\Controllers\MetaController;
use App\Controllers\PageController;
use App\Controllers\UploadController;
use App\Core\Db;
use App\Core\Response;

/** @var App\Core\Router $router */

// ---- Health -----------------------------------------------------------
$router->get('/api/health', function () {
    try {
        Db::conn()->query('SELECT 1');
        http_response_code(200);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['status' => 'ok']);
    } catch (\Throwable $e) {
        http_response_code(503);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['status' => 'error']);
    }
    exit;
});

// ---- Auth ---------------------------------------------------------------
$router->post('/api/auth/login', [AuthController::class, 'login']);
$router->post('/api/auth/logout', [AuthController::class, 'logout']);
$router->get('/api/auth/me', [AuthController::class, 'me']);
$router->post('/api/auth/change-password', [AuthController::class, 'changePassword']);

// ---- Meta / dashboard ---------------------------------------------------
$router->get('/api/meta', [MetaController::class, 'index']);
$router->get('/api/dashboard/stats', [DashboardController::class, 'stats']);

// ---- Entries (static paths before the {id} wildcard) ---------------------
$router->get('/api/entries/template', [UploadController::class, 'template']);
$router->post('/api/entries/bulk-upload', [UploadController::class, 'bulkUpload']);
$router->post('/api/entries/check-clash', [EntryController::class, 'checkClash']);
$router->get('/api/entries', [EntryController::class, 'index']);
$router->post('/api/entries', [EntryController::class, 'create']);
$router->put('/api/entries/{id}', [EntryController::class, 'update']);
$router->delete('/api/entries/{id}', [EntryController::class, 'destroy']);
$router->get('/api/entries/{id}', [EntryController::class, 'show']);

// ---- Date sheets ----------------------------------------------------------
$router->get('/api/datesheets/pdf', [DateSheetController::class, 'pdf']);
$router->get('/api/datesheets', [DateSheetController::class, 'index']);

// ---- Consolidated (EXAM_CELL) --------------------------------------------
$router->get('/api/consolidated/excel', [ConsolidatedController::class, 'excel']);
$router->get('/api/consolidated/pdf', [ConsolidatedController::class, 'pdf']);
$router->get('/api/consolidated/zip', [ConsolidatedController::class, 'zip']);
$router->get('/api/consolidated', [ConsolidatedController::class, 'index']);

// ---- Admin: master data (EXAM_CELL) --------------------------------------
$router->get('/api/admin/departments', [AdminController::class, 'listDepartments']);
$router->post('/api/admin/departments', [AdminController::class, 'createDepartment']);
$router->put('/api/admin/departments/{id}', [AdminController::class, 'updateDepartment']);
$router->delete('/api/admin/departments/{id}', [AdminController::class, 'deleteDepartment']);

$router->get('/api/admin/programs', [AdminController::class, 'listPrograms']);
$router->post('/api/admin/programs', [AdminController::class, 'createProgram']);
$router->put('/api/admin/programs/{id}', [AdminController::class, 'updateProgram']);
$router->delete('/api/admin/programs/{id}', [AdminController::class, 'deleteProgram']);

$router->get('/api/admin/subject-types', [AdminController::class, 'listSubjectTypes']);
$router->post('/api/admin/subject-types', [AdminController::class, 'createSubjectType']);
$router->put('/api/admin/subject-types/{id}', [AdminController::class, 'updateSubjectType']);
$router->delete('/api/admin/subject-types/{id}', [AdminController::class, 'deleteSubjectType']);

$router->get('/api/admin/time-slots', [AdminController::class, 'listTimeSlots']);
$router->post('/api/admin/time-slots', [AdminController::class, 'createTimeSlot']);
$router->put('/api/admin/time-slots/{id}', [AdminController::class, 'updateTimeSlot']);
$router->delete('/api/admin/time-slots/{id}', [AdminController::class, 'deleteTimeSlot']);

$router->get('/api/admin/sessions', [AdminController::class, 'listSessions']);
$router->post('/api/admin/sessions', [AdminController::class, 'createSession']);
$router->put('/api/admin/sessions/{id}', [AdminController::class, 'updateSession']);
$router->delete('/api/admin/sessions/{id}', [AdminController::class, 'deleteSession']);

$router->get('/api/admin/cycles', [AdminController::class, 'listCycles']);
$router->post('/api/admin/cycles', [AdminController::class, 'createCycle']);
$router->put('/api/admin/cycles/{id}', [AdminController::class, 'updateCycle']);
$router->patch('/api/admin/cycles/{id}/status', [AdminController::class, 'setCycleStatus']);

$router->get('/api/admin/users', [AdminController::class, 'listUsers']);
$router->post('/api/admin/users', [AdminController::class, 'createUser']);
$router->put('/api/admin/users/{id}', [AdminController::class, 'updateUser']);
$router->post('/api/admin/users/{id}/reset-password', [AdminController::class, 'resetUserPassword']);

$router->get('/api/admin/branding', [AdminController::class, 'getBranding']);
$router->put('/api/admin/branding', [AdminController::class, 'updateBranding']);
$router->post('/api/admin/branding/logo', [AdminController::class, 'uploadLogo']);
$router->post('/api/admin/branding/signature', [AdminController::class, 'uploadSignature']);

$router->get('/api/admin/audit-logs', [AdminController::class, 'auditLogs']);

// ---- Pages (server-rendered) --------------------------------------------
$router->get('/', [PageController::class, 'home']);
$router->get('/login', [PageController::class, 'login']);
$router->get('/change-password', [PageController::class, 'changePassword']);
$router->get('/dashboard', [PageController::class, 'dashboard']);
$router->get('/entries/new', [PageController::class, 'entryForm']);
$router->get('/entries/{id}/edit', [PageController::class, 'entryForm']);
$router->get('/datesheets', [PageController::class, 'datesheets']);
$router->get('/consolidated', [PageController::class, 'consolidated']);
$router->get('/admin', [PageController::class, 'admin']);
$router->get('/admin/{tab}', [PageController::class, 'admin']);
$router->get('/logout', [PageController::class, 'logout']);
