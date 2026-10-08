<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\AuditService;
use App\Services\EntryService;

class EntryController
{
    private const COURSE_CODE_REGEX = '/^[A-Z0-9][A-Z0-9\-_\/ ]{2,29}$/';

    private static function entryRules(): array
    {
        return [
            'exam_cycle_id' => ['required', 'int', 'min:1'],
            'department_id' => ['int', 'min:1'],
            'program_id' => ['required', 'int', 'min:1'],
            'semester' => ['required', 'int', 'min:1', 'max:20'],
            'exam_type' => ['required', 'string', 'in:REGULAR,REAPPEAR'],
            'subject_type_id' => ['required', 'int', 'min:1'],
            'time_slot_id' => ['required', 'int', 'min:1'],
            'exam_date' => ['required', 'date'],
            'course_code' => ['required', 'string', 'upper', 'regex:' . self::COURSE_CODE_REGEX],
            'course_name' => ['required', 'string', 'min:2', 'max:200'],
            'student_count' => ['required', 'int', 'min:1', 'max:5000'],
        ];
    }

    private static function logClashBlock(array $user, HttpException $e, array $body, ?string $ip): void
    {
        if (in_array($e->errorCode, ['CLASH', 'DUPLICATE_COURSE'], true)) {
            AuditService::log((int) $user['id'], 'ENTRY_CLASH_BLOCKED', 'exam_entries', null, [
                'code' => $e->errorCode, 'message' => $e->getMessage(), 'body' => $body,
            ], $ip);
        }
    }

    public function index(Request $request): void
    {
        $user = Auth::requireLogin();
        $filters = $request->query;
        $filters['page'] = (int) ($filters['page'] ?? 1);
        $filters['page_size'] = (int) ($filters['page_size'] ?? 20);

        $result = EntryService::listEntries($user, $filters);
        Response::json($result['rows'], 200, ['total' => $result['total'], 'page' => $result['page'], 'page_size' => $result['pageSize']]);
    }

    public function show(Request $request, array $params): void
    {
        $user = Auth::requireLogin();
        $entry = EntryService::getEntryById($user, (int) $params['id']);
        Response::json($entry);
    }

    public function checkClash(Request $request): void
    {
        $user = Auth::requireLogin();
        $rules = self::entryRules();
        $rules['exclude_id'] = ['int', 'min:1'];
        $body = Validator::validate($request->all(), $rules);

        try {
            $result = EntryService::checkClash($user, $body);
            Response::json($result);
        } catch (HttpException $e) {
            self::logClashBlock($user, $e, $body, $request->ip);
            throw $e;
        }
    }

    public function create(Request $request): void
    {
        $user = Auth::requireLogin();
        $body = Validator::validate($request->all(), self::entryRules());

        try {
            $entry = EntryService::createEntry($user, $body, $request->ip);
            Response::json($entry, 201);
        } catch (HttpException $e) {
            self::logClashBlock($user, $e, $body, $request->ip);
            throw $e;
        }
    }

    public function update(Request $request, array $params): void
    {
        $user = Auth::requireLogin();
        $rules = self::entryRules();
        foreach ($rules as $field => $fieldRules) {
            $rules[$field] = array_values(array_diff($fieldRules, ['required']));
        }
        $body = Validator::validate($request->all(), $rules);

        try {
            $entry = EntryService::updateEntry($user, (int) $params['id'], $body, $request->ip);
            Response::json($entry);
        } catch (HttpException $e) {
            self::logClashBlock($user, $e, $body, $request->ip);
            throw $e;
        }
    }

    public function destroy(Request $request, array $params): void
    {
        $user = Auth::requireLogin();
        EntryService::deleteEntry($user, (int) $params['id'], $request->ip);
        Response::json(['ok' => true]);
    }
}
