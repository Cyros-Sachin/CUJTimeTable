<?php

declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\HttpException;
use App\Core\Request;
use App\Core\Response;
use App\Core\Validator;
use App\Services\AuditService;
use App\Services\DutyExportService;
use App\Services\DutyService;
use App\Services\PdfService;

/** Invigilation duty roster API (EXAM_CELL only). Business rules live in DutyService. */
class DutyController
{
    private static function cycleId(Request $request): int
    {
        $data = Validator::validate(['cycle_id' => $request->input('cycle_id')], ['cycle_id' => ['required', 'int', 'min:1']]);
        return $data['cycle_id'];
    }

    private static function slotParams(Request $request): array
    {
        return Validator::validate([
            'exam_date' => $request->input('exam_date'),
            'time_slot_id' => $request->input('time_slot_id'),
        ], [
            'exam_date' => ['required', 'date'],
            'time_slot_id' => ['required', 'int', 'min:1'],
        ]);
    }

    private static function force(Request $request): bool
    {
        return in_array($request->input('force'), [true, 1, '1', 'true'], true);
    }

    private static function audit(array $user, string $action, ?string $entityId, ?array $details, Request $request): void
    {
        AuditService::log((int) $user['id'], $action, 'duty_rosters', $entityId, $details, $request->ip);
    }

    public function index(Request $request): void
    {
        Auth::requireRole('EXAM_CELL');
        Response::json(DutyService::overview(self::cycleId($request)));
    }

    public function updateSettings(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $cycleId = self::cycleId($request);
        $data = Validator::validate($request->all(), DutyService::SETTINGS_RULES);
        $roster = DutyService::updateSettings($cycleId, $data);
        self::audit($user, 'DUTY_SETTINGS', (string) $roster['id'], $data + ['cycle_id' => $cycleId], $request);
        Response::json($roster);
    }

    public function generate(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $cycleId = self::cycleId($request);
        $result = DutyService::generate($cycleId, (int) $user['id']);
        self::audit($user, 'DUTY_GENERATE', null, ['cycle_id' => $cycleId] + array_diff_key($result, ['short_slots' => 1]), $request);
        Response::json($result);
    }

    public function setStatus(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $cycleId = self::cycleId($request);
        $data = Validator::validate($request->all(), ['status' => ['required', 'in:DRAFT,PUBLISHED']]);
        $roster = DutyService::setStatus($cycleId, $data['status']);
        self::audit($user, $data['status'] === 'PUBLISHED' ? 'DUTY_PUBLISH' : 'DUTY_UNPUBLISH', (string) $roster['id'], ['cycle_id' => $cycleId], $request);
        Response::json($roster);
    }

    public function setSlotOverride(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $cycleId = self::cycleId($request);
        $slot = self::slotParams($request);
        $raw = $request->input('required');
        $required = null;
        if ($raw !== null && $raw !== '') {
            $required = Validator::validate(['required' => $raw], ['required' => ['int', 'min:0', 'max:500']])['required'];
        }
        DutyService::setSlotOverride($cycleId, $slot['exam_date'], $slot['time_slot_id'], $required);
        self::audit($user, 'DUTY_SLOT_OVERRIDE', null, $slot + ['cycle_id' => $cycleId, 'required' => $required], $request);
        Response::json(['ok' => true]);
    }

    public function candidates(Request $request): void
    {
        Auth::requireRole('EXAM_CELL');
        $slot = self::slotParams($request);
        Response::json(DutyService::candidates(self::cycleId($request), $slot['exam_date'], $slot['time_slot_id']));
    }

    public function addAssignment(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $cycleId = self::cycleId($request);
        $slot = self::slotParams($request);
        $data = Validator::validate($request->all(), [
            'staff_id' => ['required', 'int', 'min:1'],
            'role' => ['in:' . implode(',', DutyService::ROLES)],
        ]);
        $role = $data['role'] ?? 'INVIGILATOR';
        $id = DutyService::addAssignment($cycleId, $slot['exam_date'], $slot['time_slot_id'], $data['staff_id'], $role, self::force($request), (int) $user['id']);
        AuditService::log((int) $user['id'], 'DUTY_ADD', 'duty_assignments', (string) $id, $slot + $data + ['cycle_id' => $cycleId], $request->ip);
        Response::json(['id' => $id], 201);
    }

    public function replaceAssignment(Request $request, array $params): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $data = Validator::validate($request->all(), ['staff_id' => ['required', 'int', 'min:1']]);
        $result = DutyService::replaceAssignment((int) $params['id'], $data['staff_id'], self::force($request));
        AuditService::log((int) $user['id'], 'DUTY_REPLACE', 'duty_assignments', $params['id'], $result, $request->ip);
        Response::json($result);
    }

    public function swapAssignments(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $data = Validator::validate($request->all(), ['a_id' => ['required', 'int', 'min:1'], 'b_id' => ['required', 'int', 'min:1']]);
        $result = DutyService::swapAssignments($data['a_id'], $data['b_id'], self::force($request));
        AuditService::log((int) $user['id'], 'DUTY_SWAP', 'duty_assignments', null, $result, $request->ip);
        Response::json($result);
    }

    public function removeAssignment(Request $request, array $params): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $removed = DutyService::removeAssignment((int) $params['id']);
        AuditService::log((int) $user['id'], 'DUTY_REMOVE', 'duty_assignments', $params['id'], [
            'staff_id' => $removed['staff_id'], 'exam_date' => $removed['exam_date'], 'time_slot_id' => $removed['time_slot_id'],
        ], $request->ip);
        Response::json(['ok' => true]);
    }

    // ---- Unavailability -----------------------------------------------------------------

    public function listUnavailability(Request $request): void
    {
        Auth::requireRole('EXAM_CELL');
        Response::json(DutyService::listUnavailability(self::cycleId($request)));
    }

    public function addUnavailability(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $data = Validator::validate($request->all(), [
            'staff_id' => ['required', 'int', 'min:1'],
            'date_from' => ['required', 'date'],
            'date_to' => ['required', 'date'],
            'time_slot_id' => ['int', 'min:1'],
            'reason' => ['string', 'max:200'],
        ]);
        $result = DutyService::addUnavailability($data, (int) $user['id']);
        AuditService::log((int) $user['id'], 'DUTY_UNAVAILABLE_ADD', 'staff_unavailability', (string) $result['id'], $data, $request->ip);
        Response::json($result, 201);
    }

    public function deleteUnavailability(Request $request, array $params): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        DutyService::deleteUnavailability((int) $params['id']);
        AuditService::log((int) $user['id'], 'DUTY_UNAVAILABLE_DELETE', 'staff_unavailability', $params['id'], null, $request->ip);
        Response::json(['ok' => true]);
    }

    // ---- Exports ------------------------------------------------------------------------

    private static function overviewWithDuties(Request $request): array
    {
        $overview = DutyService::overview(self::cycleId($request));
        if ($overview['totals']['assigned'] === 0) {
            throw new HttpException(404, 'NOT_FOUND', 'No duties assigned yet. Generate the roster first.');
        }
        return $overview;
    }

    private static function fileLabel(array $cycle): string
    {
        return trim((string) preg_replace('/[^a-z0-9]+/i', '_', $cycle['title'] . ' ' . $cycle['month_year']), '_');
    }

    public function excel(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $overview = self::overviewWithDuties($request);
        $writer = new \PhpOffice\PhpSpreadsheet\Writer\Xlsx(DutyExportService::workbook($overview));
        AuditService::log((int) $user['id'], 'DUTY_EXPORT_EXCEL', 'duty_rosters', (string) $overview['roster']['id'], null, $request->ip);
        while (ob_get_level() > 0) {
            ob_end_clean();
        }
        header('Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        header('Content-Disposition: attachment; filename="CUJ_Invigilation_Duties_' . self::fileLabel($overview['cycle']) . '.xlsx"');
        header('Cache-Control: no-store');
        $writer->save('php://output');
        exit;
    }

    public function chartPdf(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $overview = self::overviewWithDuties($request);
        $extras = pdf_extras($user, $request->query);
        $pdf = PdfService::renderDutyChartPdf($overview, $extras);
        AuditService::log((int) $user['id'], 'DUTY_EXPORT_CHART', 'duty_rosters', (string) $overview['roster']['id'], ['serial' => $extras['serial']], $request->ip);
        Response::streamPdf($pdf, 'CUJ_Duty_Chart_' . self::fileLabel($overview['cycle']) . '.pdf', false);
    }

    /** One letter per staff member on duty; ?staff_id= limits it to one person. */
    public function lettersPdf(Request $request): void
    {
        $user = Auth::requireRole('EXAM_CELL');
        $overview = self::overviewWithDuties($request);
        $staffId = $request->queryParam('staff_id');
        $staff = array_values(array_filter($overview['staff_load'], fn ($s) => $s['total'] > 0
            && ($staffId === null || $staffId === '' || $s['staff_id'] === (int) $staffId)));
        if (!$staff) {
            throw new HttpException(404, 'NOT_FOUND', 'This staff member has no duties in this roster');
        }
        $extras = pdf_extras($user, $request->query);
        $pdf = PdfService::renderDutyLettersPdf($overview, $staff, $extras);
        AuditService::log((int) $user['id'], 'DUTY_EXPORT_LETTERS', 'duty_rosters', (string) $overview['roster']['id'], ['staff' => count($staff), 'serial' => $extras['serial']], $request->ip);
        $name = count($staff) === 1
            ? 'CUJ_Duty_Letter_' . preg_replace('/[^a-z0-9]+/i', '_', $staff[0]['employee_code']) . '.pdf'
            : 'CUJ_Duty_Letters_' . self::fileLabel($overview['cycle']) . '.pdf';
        Response::streamPdf($pdf, $name, false);
    }
}
