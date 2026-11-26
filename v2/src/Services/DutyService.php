<?php

declare(strict_types=1);

namespace App\Services;

use App\Core\Db;
use App\Core\HttpException;
use PDO;

/**
 * Invigilation duty roster per exam cycle.
 *
 * Slots: every (exam_date, time_slot) that has at least one exam_entries row in the cycle.
 *
 * Teachers needed per slot:
 *  - Slot WITH a seating allotment (duty_rooms): every room / class gets per_room_small teachers,
 *    or per_room_large when it seats more than room_threshold students (defaults: 1, 2 above 35).
 *    The slot needs the sum over its rooms, and each invigilator is posted to a room.
 *  - Slot WITHOUT seating yet: max(min_per_slot, ceil(students / students_per_invigilator)), unless
 *    the Exam Cell stored an override. These duties have no room until seating is added.
 * Reserves per slot come from the roster settings and are never tied to a room.
 *
 * Rotation (generate()): a least-recently-assigned cyclic queue. Slots are processed in date/time
 * order (rooms in seating order within a slot); each takes the first eligible staff from the front
 * of the queue and moves them to the back. Staff skipped because they were ineligible (on leave,
 * over the daily limit, own-department paper in the slot) keep their place at the front, so they
 * are first in line for the next slot they can take. That keeps duty counts even and the order
 * cyclic. The starting order puts staff with the fewest duties in earlier PUBLISHED rosters first,
 * so the rotation carries on across exam cycles instead of restarting.
 *
 * Manual assignments (added / replaced / swapped by hand) are kept when the roster is regenerated
 * and count towards their slot's (and room's) requirement. A PUBLISHED roster is read-only.
 */
class DutyService
{
    public const ROLES = ['INVIGILATOR', 'RESERVE'];

    public const SETTINGS_RULES = [
        'students_per_invigilator' => ['int', 'min:1', 'max:1000'],
        'min_per_slot' => ['int', 'min:0', 'max:500'],
        'reserve_per_slot' => ['int', 'min:0', 'max:100'],
        'max_per_day' => ['int', 'min:1', 'max:10'],
        'room_threshold' => ['int', 'min:1', 'max:1000'],
        'per_room_small' => ['int', 'min:1', 'max:10'],
        'per_room_large' => ['int', 'min:1', 'max:10'],
        'exclude_own_department' => ['bool'],
    ];

    public const ROOM_NAME_MAX = 60;
    public const ROOM_STUDENTS_MAX = 1000;

    // ---- Loading ------------------------------------------------------------------------

    public static function cycle(int $cycleId, ?PDO $pdo = null): array
    {
        $pdo ??= Db::conn();
        $stmt = $pdo->prepare('SELECT id, title, month_year, start_date, end_date, status FROM exam_cycles WHERE id = :id');
        $stmt->execute(['id' => $cycleId]);
        $cycle = $stmt->fetch();
        if (!$cycle) {
            throw new HttpException(404, 'NOT_FOUND', 'Exam cycle not found');
        }
        return $cycle;
    }

    /** The cycle's roster, created with default settings on first use. */
    public static function roster(int $cycleId, ?PDO $pdo = null, bool $forUpdate = false): array
    {
        $pdo ??= Db::conn();
        self::cycle($cycleId, $pdo);
        $pdo->prepare('INSERT IGNORE INTO duty_rosters (exam_cycle_id) VALUES (:c)')->execute(['c' => $cycleId]);
        $stmt = $pdo->prepare('SELECT * FROM duty_rosters WHERE exam_cycle_id = :c' . ($forUpdate ? ' FOR UPDATE' : ''));
        $stmt->execute(['c' => $cycleId]);
        return self::castRoster($stmt->fetch());
    }

    private static function rosterById(PDO $pdo, int $rosterId, bool $forUpdate = false): array
    {
        $stmt = $pdo->prepare('SELECT * FROM duty_rosters WHERE id = :id' . ($forUpdate ? ' FOR UPDATE' : ''));
        $stmt->execute(['id' => $rosterId]);
        $row = $stmt->fetch();
        if (!$row) {
            throw new HttpException(404, 'NOT_FOUND', 'Duty roster not found');
        }
        return self::castRoster($row);
    }

    private static function castRoster(array $r): array
    {
        foreach (['id', 'exam_cycle_id', 'students_per_invigilator', 'min_per_slot', 'reserve_per_slot', 'max_per_day',
            'room_threshold', 'per_room_small', 'per_room_large', 'exclude_own_department'] as $k) {
            $r[$k] = (int) $r[$k];
        }
        return $r;
    }

    private static function assertEditable(array $roster): void
    {
        if ($roster['status'] === 'PUBLISHED') {
            throw new HttpException(409, 'ROSTER_PUBLISHED', 'This duty roster is published. Unpublish it before making changes.');
        }
    }

    private static function key(string $date, int $slotId): string
    {
        return $date . '|' . $slotId;
    }

    /** @return array<string,array> exam slots of the cycle keyed by "date|slotId", in date/time order */
    public static function examSlots(int $cycleId, ?PDO $pdo = null): array
    {
        $pdo ??= Db::conn();
        $stmt = $pdo->prepare(
            'SELECT e.exam_date, e.time_slot_id, t.label AS time_slot_label, t.start_time, t.end_time,
                    COUNT(*) AS paper_count, SUM(e.student_count) AS total_students,
                    GROUP_CONCAT(DISTINCT e.department_id) AS department_ids
             FROM exam_entries e JOIN time_slots t ON t.id = e.time_slot_id
             WHERE e.exam_cycle_id = :c
             GROUP BY e.exam_date, e.time_slot_id, t.label, t.start_time, t.end_time
             ORDER BY e.exam_date, t.start_time'
        );
        $stmt->execute(['c' => $cycleId]);
        $out = [];
        foreach ($stmt->fetchAll() as $s) {
            $s['time_slot_id'] = (int) $s['time_slot_id'];
            $s['paper_count'] = (int) $s['paper_count'];
            $s['total_students'] = (int) $s['total_students'];
            $s['department_ids'] = array_map('intval', explode(',', (string) $s['department_ids']));
            $out[self::key($s['exam_date'], $s['time_slot_id'])] = $s;
        }
        return $out;
    }

    /** Invigilators for a slot without seating: max(minimum, ceil(students / ratio)). */
    public static function required(array $roster, int $students): int
    {
        return max($roster['min_per_slot'], (int) ceil($students / max(1, $roster['students_per_invigilator'])));
    }

    /** Teachers for one room / class of the seating allotment. */
    public static function roomTeachers(array $roster, int $students): int
    {
        return $students > $roster['room_threshold'] ? $roster['per_room_large'] : $roster['per_room_small'];
    }

    /** @return array<string,int> */
    private static function overrides(PDO $pdo, int $rosterId): array
    {
        $stmt = $pdo->prepare('SELECT exam_date, time_slot_id, required FROM duty_slot_overrides WHERE roster_id = :r');
        $stmt->execute(['r' => $rosterId]);
        $out = [];
        foreach ($stmt->fetchAll() as $o) {
            $out[self::key($o['exam_date'], (int) $o['time_slot_id'])] = (int) $o['required'];
        }
        return $out;
    }

    /** @return array<string,array<int,array{id:int,room:string,students:int,course_codes:string[]}>> seating per "date|slotId", in seating order */
    private static function rooms(PDO $pdo, int $rosterId): array
    {
        $stmt = $pdo->prepare('SELECT id, exam_date, time_slot_id, room, students, course_codes FROM duty_rooms WHERE roster_id = :r ORDER BY exam_date, time_slot_id, sort_order, id');
        $stmt->execute(['r' => $rosterId]);
        $out = [];
        foreach ($stmt->fetchAll() as $r) {
            $out[self::key($r['exam_date'], (int) $r['time_slot_id'])][] = [
                'id' => (int) $r['id'], 'room' => $r['room'], 'students' => (int) $r['students'],
                'course_codes' => self::splitCodes((string) $r['course_codes']),
            ];
        }
        return $out;
    }

    /**
     * "ucse0o001t,  IPHY1C02 ; IECO1C01 / IECO1C001T" -> ['UCSE0O001T', 'IPHY1C02', 'IECO1C01/IECO1C001T'].
     * Separated by comma, semicolon or new line only: the date sheet has combined old/new codes joined by "/".
     */
    public static function splitCodes(?string $raw): array
    {
        $codes = [];
        foreach (preg_split('/[,;\r\n]+/', strtoupper((string) $raw)) ?: [] as $code) {
            $code = (string) preg_replace('/\s*\/\s*/', '/', trim((string) preg_replace('/\s+/', ' ', $code)));
            if ($code !== '') {
                $codes[] = $code;
            }
        }
        return array_values(array_unique($codes));
    }

    /** @return array<string,array<string,string>> course code -> course name, per "date|slotId" of the cycle */
    private static function slotCourses(PDO $pdo, int $cycleId): array
    {
        $stmt = $pdo->prepare('SELECT exam_date, time_slot_id, course_code, MIN(course_name) AS course_name FROM exam_entries WHERE exam_cycle_id = :c GROUP BY exam_date, time_slot_id, course_code');
        $stmt->execute(['c' => $cycleId]);
        $out = [];
        foreach ($stmt->fetchAll() as $e) {
            $out[self::key($e['exam_date'], (int) $e['time_slot_id'])][strtoupper($e['course_code'])] = $e['course_name'];
        }
        return $out;
    }

    /** [{code, name}] for a room's codes; codes no longer on the date sheet for that slot are dropped. */
    private static function roomCourses(array $room, array $courses): array
    {
        $out = [];
        foreach ($room['course_codes'] as $code) {
            if (isset($courses[$code])) {
                $out[] = ['code' => $code, 'name' => $courses[$code]];
            }
        }
        return $out;
    }

    private static function assignments(PDO $pdo, int $rosterId): array
    {
        $stmt = $pdo->prepare(
            'SELECT a.id, a.exam_date, a.time_slot_id, a.room_id, a.staff_id, a.role, a.is_manual,
                    r.room AS room_name,
                    s.employee_code, s.name, s.designation, s.email, s.phone, s.department_id, s.is_active,
                    d.name AS department_name, d.code AS department_code
             FROM duty_assignments a
             JOIN staff s ON s.id = a.staff_id
             LEFT JOIN duty_rooms r ON r.id = a.room_id
             LEFT JOIN departments d ON d.id = s.department_id
             WHERE a.roster_id = :roster
             ORDER BY a.exam_date, a.time_slot_id, a.role, s.name'
        );
        $stmt->execute(['roster' => $rosterId]);
        return array_map(static function (array $a): array {
            foreach (['id', 'time_slot_id', 'staff_id', 'is_manual', 'is_active'] as $k) {
                $a[$k] = (int) $a[$k];
            }
            $a['room_id'] = $a['room_id'] !== null ? (int) $a['room_id'] : null;
            $a['department_id'] = $a['department_id'] !== null ? (int) $a['department_id'] : null;
            return $a;
        }, $stmt->fetchAll());
    }

    /** @return array<int,array<int,array{from:string,to:string,slot:?int}>> unavailability per staff id overlapping [from, to] */
    private static function unavailabilityMap(PDO $pdo, string $from, string $to): array
    {
        $stmt = $pdo->prepare('SELECT staff_id, date_from, date_to, time_slot_id FROM staff_unavailability WHERE date_to >= :f AND date_from <= :t');
        $stmt->execute(['f' => $from, 't' => $to]);
        $map = [];
        foreach ($stmt->fetchAll() as $u) {
            $map[(int) $u['staff_id']][] = [
                'from' => $u['date_from'], 'to' => $u['date_to'],
                'slot' => $u['time_slot_id'] !== null ? (int) $u['time_slot_id'] : null,
            ];
        }
        return $map;
    }

    private static function isUnavailable(array $map, int $staffId, string $date, int $slotId): bool
    {
        foreach ($map[$staffId] ?? [] as $u) {
            if ($date >= $u['from'] && $date <= $u['to'] && ($u['slot'] === null || $u['slot'] === $slotId)) {
                return true;
            }
        }
        return false;
    }

    // ---- Overview ---------------------------------------------------------------------------

    /** Full roster state for the Duties page and the exports. */
    public static function overview(int $cycleId): array
    {
        $pdo = Db::conn();
        $cycle = self::cycle($cycleId, $pdo);
        $roster = self::roster($cycleId, $pdo);
        $slots = self::examSlots($cycleId, $pdo);
        $overrides = self::overrides($pdo, $roster['id']);
        $roomsByKey = self::rooms($pdo, $roster['id']);
        $assignments = self::assignments($pdo, $roster['id']);
        $courses = self::slotCourses($pdo, $cycleId);
        $roomById = [];

        $byKey = [];
        $orphans = [];
        foreach ($assignments as $a) {
            $k = self::key($a['exam_date'], $a['time_slot_id']);
            if (isset($slots[$k])) {
                $byKey[$k][] = $a;
            } else {
                $orphans[] = $a;
            }
        }

        $outSlots = [];
        $totals = ['slots' => 0, 'slots_with_seating' => 0, 'rooms' => 0, 'required' => 0, 'reserve_required' => 0,
            'assigned' => 0, 'shortfall' => 0, 'reserve_shortfall' => 0];
        foreach ($slots as $k => $s) {
            $inv = array_values(array_filter($byKey[$k] ?? [], fn ($a) => $a['role'] === 'INVIGILATOR'));
            $res = array_values(array_filter($byKey[$k] ?? [], fn ($a) => $a['role'] === 'RESERVE'));
            $slotRooms = $roomsByKey[$k] ?? [];
            $computed = self::required($roster, $s['total_students']);
            $override = $overrides[$k] ?? null;

            $rooms = [];
            $unroomed = $inv;
            $roomShort = 0;
            if ($slotRooms) {
                $unroomed = array_values(array_filter($inv, fn ($a) => $a['room_id'] === null));
                foreach ($slotRooms as $r) {
                    $need = self::roomTeachers($roster, $r['students']);
                    $people = array_values(array_filter($inv, fn ($a) => $a['room_id'] === $r['id']));
                    $short = max(0, $need - count($people));
                    $roomShort += $short;
                    $r['courses'] = self::roomCourses($r, $courses[$k] ?? []);
                    $roomById[$r['id']] = $r;
                    $rooms[] = $r + ['required' => $need, 'invigilators' => $people, 'shortfall' => $short];
                }
                $required = array_sum(array_column($rooms, 'required'));
                // Invigilators without a room still cover the slot; they just need posting to a room.
                $shortfall = max(0, $roomShort - count($unroomed));
            } else {
                $required = $override ?? $computed;
                $shortfall = max(0, $required - count($inv));
            }

            $seated = array_sum(array_column($slotRooms, 'students'));
            $slot = $s + [
                'weekday' => weekday_of($s['exam_date']),
                'has_seating' => (bool) $slotRooms,
                'seated_students' => $seated,
                'rooms' => $rooms,
                'computed_required' => $computed,
                'override_required' => $slotRooms ? null : $override,
                'required' => $required,
                'reserve_required' => $roster['reserve_per_slot'],
                'invigilators' => $inv,
                'unroomed' => $slotRooms ? $unroomed : [],
                'reserves' => $res,
                'shortfall' => $shortfall,
                'reserve_shortfall' => max(0, $roster['reserve_per_slot'] - count($res)),
            ];
            $outSlots[] = $slot;
            $totals['slots']++;
            $totals['slots_with_seating'] += $slotRooms ? 1 : 0;
            $totals['rooms'] += count($slotRooms);
            $totals['required'] += $required;
            $totals['reserve_required'] += $roster['reserve_per_slot'];
            $totals['assigned'] += count($inv) + count($res);
            $totals['shortfall'] += $slot['shortfall'];
            $totals['reserve_shortfall'] += $slot['reserve_shortfall'];
        }

        // Duty load per staff member: every active staff (zero rows included) plus anyone inactive who still has duties.
        $staffRows = $pdo->query(
            'SELECT s.id, s.employee_code, s.name, s.designation, s.email, s.phone, s.department_id, s.is_active,
                    d.name AS department_name
             FROM staff s LEFT JOIN departments d ON d.id = s.department_id
             ORDER BY d.name IS NULL, d.name, s.name'
        )->fetchAll();
        $load = [];
        foreach ($staffRows as $s) {
            $load[(int) $s['id']] = [
                'staff_id' => (int) $s['id'], 'employee_code' => $s['employee_code'], 'name' => $s['name'],
                'designation' => $s['designation'], 'email' => $s['email'], 'phone' => $s['phone'],
                'department_name' => $s['department_name'], 'is_active' => (int) $s['is_active'],
                'invigilator' => 0, 'reserve' => 0, 'total' => 0, 'duties' => [],
            ];
        }
        foreach ($assignments as $a) {
            $k = self::key($a['exam_date'], $a['time_slot_id']);
            if (!isset($slots[$k]) || !isset($load[$a['staff_id']])) {
                continue;
            }
            $l = &$load[$a['staff_id']];
            $l[$a['role'] === 'RESERVE' ? 'reserve' : 'invigilator']++;
            $l['total']++;
            $l['duties'][] = [
                'assignment_id' => $a['id'], 'exam_date' => $a['exam_date'], 'weekday' => weekday_of($a['exam_date']),
                'time_slot_id' => $a['time_slot_id'], 'time_slot_label' => $slots[$k]['time_slot_label'],
                'start_time' => $slots[$k]['start_time'], 'role' => $a['role'], 'room' => $a['room_name'],
                'courses' => $a['room_id'] !== null ? ($roomById[$a['room_id']]['courses'] ?? []) : [],
            ];
            unset($l);
        }
        $load = array_values(array_filter($load, fn ($l) => $l['is_active'] || $l['total'] > 0));
        foreach ($load as &$l) {
            usort($l['duties'], fn ($a, $b) => ($a['exam_date'] . $a['start_time']) <=> ($b['exam_date'] . $b['start_time']));
        }
        unset($l);

        $active = array_filter($load, fn ($l) => $l['is_active']);
        $counts = array_map(fn ($l) => $l['total'], $active);
        $totals['active_staff'] = count($active);
        $totals['staff_on_duty'] = count(array_filter($load, fn ($l) => $l['total'] > 0));
        $totals['min_load'] = $counts ? min($counts) : 0;
        $totals['max_load'] = $counts ? max($counts) : 0;

        return [
            'cycle' => $cycle,
            'roster' => $roster,
            'slots' => $outSlots,
            'orphans' => $orphans,
            'staff_load' => $load,
            'totals' => $totals,
        ];
    }

    // ---- Settings / status / overrides --------------------------------------------------

    public static function updateSettings(int $cycleId, array $data): array
    {
        return Db::transaction(function (PDO $pdo) use ($cycleId, $data) {
            $roster = self::roster($cycleId, $pdo, true);
            self::assertEditable($roster);
            if (!$data) {
                throw new HttpException(400, 'BAD_REQUEST', 'No settings to update');
            }
            $sets = implode(', ', array_map(fn ($f) => "{$f} = :{$f}", array_keys($data)));
            $pdo->prepare("UPDATE duty_rosters SET {$sets} WHERE id = :id")->execute($data + ['id' => $roster['id']]);
            return self::rosterById($pdo, $roster['id']);
        });
    }

    public static function setStatus(int $cycleId, string $status): array
    {
        return Db::transaction(function (PDO $pdo) use ($cycleId, $status) {
            $roster = self::roster($cycleId, $pdo, true);
            if ($status === 'PUBLISHED') {
                $count = $pdo->prepare('SELECT COUNT(*) AS c FROM duty_assignments WHERE roster_id = :r');
                $count->execute(['r' => $roster['id']]);
                if ((int) $count->fetch()['c'] === 0) {
                    throw new HttpException(422, 'ROSTER_EMPTY', 'Generate or add duties before publishing');
                }
            }
            $pdo->prepare('UPDATE duty_rosters SET status = :s, published_at = ' . ($status === 'PUBLISHED' ? 'NOW()' : 'NULL') . ' WHERE id = :id')
                ->execute(['s' => $status, 'id' => $roster['id']]);
            return self::rosterById($pdo, $roster['id']);
        });
    }

    /** Set (int) or clear (null) the invigilators-needed override for one slot without seating. */
    public static function setSlotOverride(int $cycleId, string $date, int $slotId, ?int $required): void
    {
        Db::transaction(function (PDO $pdo) use ($cycleId, $date, $slotId, $required) {
            $roster = self::roster($cycleId, $pdo, true);
            self::assertEditable($roster);
            self::slotOrFail($cycleId, $date, $slotId, $pdo);
            if ($required === null) {
                $pdo->prepare('DELETE FROM duty_slot_overrides WHERE roster_id = :r AND exam_date = :d AND time_slot_id = :s')
                    ->execute(['r' => $roster['id'], 'd' => $date, 's' => $slotId]);
                return;
            }
            $pdo->prepare(
                'INSERT INTO duty_slot_overrides (roster_id, exam_date, time_slot_id, required) VALUES (:r, :d, :s, :q)
                 ON DUPLICATE KEY UPDATE required = VALUES(required)'
            )->execute(['r' => $roster['id'], 'd' => $date, 's' => $slotId, 'q' => $required]);
        });
    }

    private static function slotOrFail(int $cycleId, string $date, int $slotId, PDO $pdo): array
    {
        $slots = self::examSlots($cycleId, $pdo);
        $slot = $slots[self::key($date, $slotId)] ?? null;
        if (!$slot) {
            throw new HttpException(422, 'NO_EXAMS_IN_SLOT', 'No exams are scheduled in this date and time slot');
        }
        return $slot;
    }

    // ---- Seating allotment ---------------------------------------------------------------

    /**
     * Replace the seating of several slots at once (one transaction).
     * $seating: list of [exam_date, time_slot_id, rooms => [[room, students, ?course codes], ...]]. Course codes
     * are optional and must be papers of that date + session. An empty room list
     * clears that slot's seating. Rooms whose name is unchanged keep their id, so invigilators already
     * posted there stay posted; removed rooms release their invigilators (room_id -> NULL).
     *
     * @return array{slots:int, rooms:int}
     */
    public static function replaceSeating(int $cycleId, array $seating): array
    {
        return Db::transaction(function (PDO $pdo) use ($cycleId, $seating) {
            $roster = self::roster($cycleId, $pdo, true);
            self::assertEditable($roster);
            $slots = self::examSlots($cycleId, $pdo);
            $existing = self::rooms($pdo, $roster['id']);
            $courses = self::slotCourses($pdo, $cycleId);

            $ins = $pdo->prepare(
                'INSERT INTO duty_rooms (roster_id, exam_date, time_slot_id, room, students, course_codes, sort_order)
                 VALUES (:r, :d, :s, :room, :students, :codes, :o)'
            );
            $upd = $pdo->prepare('UPDATE duty_rooms SET students = :students, course_codes = :codes, sort_order = :o, room = :room WHERE id = :id');
            $del = $pdo->prepare('DELETE FROM duty_rooms WHERE id = :id');
            $roomCount = 0;
            foreach ($seating as $entry) {
                $k = self::key($entry['exam_date'], (int) $entry['time_slot_id']);
                if (!isset($slots[$k])) {
                    throw new HttpException(422, 'NO_EXAMS_IN_SLOT', 'No exams are scheduled on ' . ddmmyyyy($entry['exam_date']) . ' in that session');
                }
                $current = [];
                foreach ($existing[$k] ?? [] as $r) {
                    $current[mb_strtolower($r['room'])] = $r['id'];
                }
                $keep = [];
                foreach (array_values($entry['rooms']) as $i => $spec) {
                    [$room, $students] = $spec;
                    $lk = mb_strtolower($room);
                    if (isset($keep[$lk])) {
                        throw new HttpException(422, 'VALIDATION', "Room \"{$room}\" is listed twice for " . ddmmyyyy($entry['exam_date']));
                    }
                    $codes = self::splitCodes($spec[2] ?? '');
                    $unknown = array_diff($codes, array_keys($courses[$k] ?? []));
                    if ($unknown) {
                        throw new HttpException(422, 'VALIDATION', 'No paper ' . implode(', ', $unknown) . ' on ' . ddmmyyyy($entry['exam_date']) . " in that session (room \"{$room}\")");
                    }
                    $codeText = $codes ? implode(', ', $codes) : null;
                    if ($codeText !== null && mb_strlen($codeText) > 1000) {
                        throw new HttpException(422, 'VALIDATION', "Too many course codes for room \"{$room}\"");
                    }
                    if (isset($current[$lk])) {
                        $upd->execute(['students' => $students, 'codes' => $codeText, 'o' => $i, 'room' => $room, 'id' => $current[$lk]]);
                        $keep[$lk] = $current[$lk];
                    } else {
                        $ins->execute(['r' => $roster['id'], 'd' => $entry['exam_date'], 's' => (int) $entry['time_slot_id'], 'room' => $room, 'students' => $students, 'codes' => $codeText, 'o' => $i]);
                        $keep[$lk] = (int) $pdo->lastInsertId();
                    }
                    $roomCount++;
                }
                foreach ($current as $lk => $id) {
                    if (!isset($keep[$lk])) {
                        $del->execute(['id' => $id]);
                    }
                }
            }
            return ['slots' => count($seating), 'rooms' => $roomCount];
        });
    }

    /** All seating of the cycle, for the template / round-trip export. */
    public static function seatingRows(int $cycleId): array
    {
        $pdo = Db::conn();
        $roster = self::roster($cycleId, $pdo);
        $stmt = $pdo->prepare(
            'SELECT r.exam_date, t.label AS time_slot_label, r.room, r.students, r.course_codes
             FROM duty_rooms r JOIN time_slots t ON t.id = r.time_slot_id
             WHERE r.roster_id = :r ORDER BY r.exam_date, t.start_time, r.sort_order, r.id'
        );
        $stmt->execute(['r' => $roster['id']]);
        return $stmt->fetchAll();
    }

    // ---- Generation ---------------------------------------------------------------------

    /** @return array{slots:int, assigned:int, kept_manual:int, shortfall:int, short_slots:array} */
    public static function generate(int $cycleId, int $userId): array
    {
        return Db::transaction(function (PDO $pdo) use ($cycleId, $userId) {
            $roster = self::roster($cycleId, $pdo, true);
            self::assertEditable($roster);

            $slots = self::examSlots($cycleId, $pdo);
            if (!$slots) {
                throw new HttpException(422, 'NO_EXAMS', 'This exam cycle has no scheduled exams yet');
            }
            $staff = [];
            foreach ($pdo->query('SELECT id, employee_code, department_id FROM staff WHERE is_active = 1')->fetchAll() as $s) {
                $staff[(int) $s['id']] = ['code' => $s['employee_code'], 'dept' => $s['department_id'] !== null ? (int) $s['department_id'] : null];
            }
            if (!$staff) {
                throw new HttpException(422, 'NO_STAFF', 'Add staff in Admin > Duty Staff before generating duties');
            }

            // Starting order: fewest duties in earlier published rosters first, then the longest since
            // their last duty, then employee code — so the rotation continues across cycles.
            $hist = $pdo->prepare(
                "SELECT a.staff_id, COUNT(*) AS c, MAX(a.exam_date) AS last_date
                 FROM duty_assignments a JOIN duty_rosters r ON r.id = a.roster_id
                 WHERE r.status = 'PUBLISHED' AND r.id <> :r GROUP BY a.staff_id"
            );
            $hist->execute(['r' => $roster['id']]);
            $history = [];
            foreach ($hist->fetchAll() as $h) {
                $history[(int) $h['staff_id']] = ['c' => (int) $h['c'], 'last' => (string) $h['last_date']];
            }
            $queue = array_keys($staff);
            usort($queue, static function (int $a, int $b) use ($history, $staff): int {
                $ha = $history[$a] ?? ['c' => 0, 'last' => ''];
                $hb = $history[$b] ?? ['c' => 0, 'last' => ''];
                return [$ha['c'], $ha['last']] <=> [$hb['c'], $hb['last']]
                    ?: strnatcasecmp($staff[$a]['code'], $staff[$b]['code']);
            });

            $dates = array_column($slots, 'exam_date');
            $unavailable = self::unavailabilityMap($pdo, min($dates), max($dates));
            $overrides = self::overrides($pdo, $roster['id']);
            $roomsByKey = self::rooms($pdo, $roster['id']);

            // Auto assignments are rebuilt; manual ones are kept unless their slot no longer has exams.
            $pdo->prepare('DELETE FROM duty_assignments WHERE roster_id = :r AND is_manual = 0')->execute(['r' => $roster['id']]);
            $manual = [];
            $dayCount = [];
            foreach (self::assignments($pdo, $roster['id']) as $a) {
                $k = self::key($a['exam_date'], $a['time_slot_id']);
                if (!isset($slots[$k])) {
                    $pdo->prepare('DELETE FROM duty_assignments WHERE id = :id')->execute(['id' => $a['id']]);
                    continue;
                }
                $manual[$k][] = $a;
                $dayCount[$a['staff_id']][$a['exam_date']] = ($dayCount[$a['staff_id']][$a['exam_date']] ?? 0) + 1;
            }
            $keptManual = array_sum(array_map('count', $manual));

            $insert = $pdo->prepare(
                'INSERT INTO duty_assignments (roster_id, exam_date, time_slot_id, room_id, staff_id, role, is_manual, created_by)
                 VALUES (:r, :d, :s, :room, :staff, :role, 0, :u)'
            );
            $postToRoom = $pdo->prepare('UPDATE duty_assignments SET room_id = :room WHERE id = :id');
            $moveToBack = static function (array $queue, array $ids): array {
                if (!$ids) {
                    return $queue;
                }
                $flip = array_flip($ids);
                return array_merge(array_values(array_filter($queue, fn ($id) => !isset($flip[$id]))), $ids);
            };

            $assigned = 0;
            $shortfall = 0;
            $shortSlots = [];
            foreach ($slots as $k => $slot) {
                $date = $slot['exam_date'];
                $slotId = $slot['time_slot_id'];
                $slotDepts = array_flip($slot['department_ids']);
                $taken = [];
                $manualIds = [];
                foreach ($manual[$k] ?? [] as $a) {
                    $taken[$a['staff_id']] = true;
                    $manualIds[] = $a['staff_id'];
                }
                // Hand-assigned staff did a duty here too: they go to the back of the rotation.
                $queue = $moveToBack($queue, array_values(array_intersect($manualIds, $queue)));

                // Buckets to fill: one per room of the seating allotment, or one for the whole slot.
                $slotRooms = $roomsByKey[$k] ?? [];
                $manualInv = array_values(array_filter($manual[$k] ?? [], fn ($a) => $a['role'] === 'INVIGILATOR'));
                $manualRes = count(array_filter($manual[$k] ?? [], fn ($a) => $a['role'] === 'RESERVE'));
                $buckets = [];
                if ($slotRooms) {
                    $roomIds = array_column($slotRooms, 'id');
                    $have = array_fill_keys($roomIds, 0);
                    $loose = [];
                    foreach ($manualInv as $a) {
                        if ($a['room_id'] !== null && isset($have[$a['room_id']])) {
                            $have[$a['room_id']]++;
                        } else {
                            $loose[] = $a;
                        }
                    }
                    foreach ($slotRooms as $r) {
                        $need = self::roomTeachers($roster, $r['students']) - $have[$r['id']];
                        // Hand-added invigilators without a room are posted to rooms that still need someone.
                        while ($need > 0 && $loose) {
                            $postToRoom->execute(['room' => $r['id'], 'id' => array_shift($loose)['id']]);
                            $need--;
                        }
                        $buckets[] = ['role' => 'INVIGILATOR', 'room' => $r, 'need' => max(0, $need)];
                    }
                } else {
                    $need = ($overrides[$k] ?? self::required($roster, $slot['total_students'])) - count($manualInv);
                    $buckets[] = ['role' => 'INVIGILATOR', 'room' => null, 'need' => max(0, $need)];
                }
                $buckets[] = ['role' => 'RESERVE', 'room' => null, 'need' => max(0, $roster['reserve_per_slot'] - $manualRes)];

                foreach ($buckets as $b) {
                    $picked = [];
                    foreach ($queue as $id) {
                        if (count($picked) >= $b['need']) {
                            break;
                        }
                        if (isset($taken[$id])
                            || ($dayCount[$id][$date] ?? 0) >= $roster['max_per_day']
                            || self::isUnavailable($unavailable, $id, $date, $slotId)
                            || ($roster['exclude_own_department'] && $staff[$id]['dept'] !== null && isset($slotDepts[$staff[$id]['dept']]))) {
                            continue;
                        }
                        $picked[] = $id;
                        $taken[$id] = true;
                        $dayCount[$id][$date] = ($dayCount[$id][$date] ?? 0) + 1;
                    }
                    foreach ($picked as $id) {
                        $insert->execute(['r' => $roster['id'], 'd' => $date, 's' => $slotId, 'room' => $b['room']['id'] ?? null,
                            'staff' => $id, 'role' => $b['role'], 'u' => $userId]);
                    }
                    $queue = $moveToBack($queue, $picked);
                    $assigned += count($picked);
                    $missing = $b['need'] - count($picked);
                    if ($missing > 0) {
                        $shortfall += $missing;
                        $shortSlots[] = ['exam_date' => $date, 'time_slot_label' => $slot['time_slot_label'], 'role' => $b['role'],
                            'room' => $b['room']['room'] ?? null, 'missing' => $missing];
                    }
                }
            }

            $pdo->prepare('UPDATE duty_rosters SET generated_at = NOW(), generated_by = :u WHERE id = :id')
                ->execute(['u' => $userId, 'id' => $roster['id']]);

            return ['slots' => count($slots), 'assigned' => $assigned, 'kept_manual' => $keptManual, 'shortfall' => $shortfall, 'short_slots' => $shortSlots];
        });
    }

    // ---- Manual edits -------------------------------------------------------------------

    private static function staffOrFail(PDO $pdo, int $staffId): array
    {
        $stmt = $pdo->prepare('SELECT id, employee_code, name, department_id, is_active FROM staff WHERE id = :id');
        $stmt->execute(['id' => $staffId]);
        $s = $stmt->fetch();
        if (!$s) {
            throw new HttpException(404, 'NOT_FOUND', 'Staff member not found');
        }
        return $s;
    }

    private static function assignmentOrFail(PDO $pdo, int $id): array
    {
        $stmt = $pdo->prepare('SELECT * FROM duty_assignments WHERE id = :id FOR UPDATE');
        $stmt->execute(['id' => $id]);
        $a = $stmt->fetch();
        if (!$a) {
            throw new HttpException(404, 'NOT_FOUND', 'Duty assignment not found');
        }
        $a['time_slot_id'] = (int) $a['time_slot_id'];
        $a['staff_id'] = (int) $a['staff_id'];
        $a['roster_id'] = (int) $a['roster_id'];
        return $a;
    }

    /**
     * Checks putting $staff on duty in a slot. Hard problems throw (409 DUTY_BLOCKED); soft ones
     * (on leave, over the daily limit, own-department paper) are returned as warnings.
     * $ignoreIds: assignments that are being replaced/moved and must not count against the staff member.
     *
     * @return string[]
     */
    private static function check(PDO $pdo, array $roster, array $staff, array $slot, array $ignoreIds = []): array
    {
        if (!(int) $staff['is_active']) {
            throw new HttpException(409, 'DUTY_BLOCKED', "{$staff['name']} is inactive");
        }
        $ignore = $ignoreIds ? ' AND id NOT IN (' . implode(',', array_map('intval', $ignoreIds)) . ')' : '';
        $stmt = $pdo->prepare('SELECT time_slot_id FROM duty_assignments WHERE roster_id = :r AND staff_id = :s AND exam_date = :d' . $ignore);
        $stmt->execute(['r' => $roster['id'], 's' => $staff['id'], 'd' => $slot['exam_date']]);
        $sameDay = array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
        if (in_array($slot['time_slot_id'], $sameDay, true)) {
            throw new HttpException(409, 'DUTY_BLOCKED', "{$staff['name']} is already on duty in this slot");
        }

        $warnings = [];
        if (count($sameDay) >= $roster['max_per_day']) {
            $warnings[] = "{$staff['name']} already has " . count($sameDay) . " duty(ies) on " . ddmmyyyy($slot['exam_date']) . " (daily limit {$roster['max_per_day']})";
        }
        $map = self::unavailabilityMap($pdo, $slot['exam_date'], $slot['exam_date']);
        if (self::isUnavailable($map, (int) $staff['id'], $slot['exam_date'], $slot['time_slot_id'])) {
            $warnings[] = "{$staff['name']} is marked unavailable on " . ddmmyyyy($slot['exam_date']);
        }
        if ($roster['exclude_own_department'] && $staff['department_id'] !== null && in_array((int) $staff['department_id'], $slot['department_ids'], true)) {
            $warnings[] = "{$staff['name']}'s own department has a paper in this slot";
        }
        return $warnings;
    }

    private static function confirmWarnings(array $warnings, bool $force): void
    {
        if ($warnings && !$force) {
            throw new HttpException(409, 'DUTY_CONFLICT', implode('. ', $warnings), ['warnings' => $warnings]);
        }
    }

    /** $roomId: post the invigilator to this room of the slot's seating (null for reserves / no seating). */
    public static function addAssignment(int $cycleId, string $date, int $slotId, int $staffId, string $role, ?int $roomId, bool $force, int $userId): int
    {
        return Db::transaction(function (PDO $pdo) use ($cycleId, $date, $slotId, $staffId, $role, $roomId, $force, $userId) {
            $roster = self::roster($cycleId, $pdo, true);
            self::assertEditable($roster);
            $slot = self::slotOrFail($cycleId, $date, $slotId, $pdo);
            if ($role === 'RESERVE') {
                $roomId = null;
            }
            if ($roomId !== null) {
                $stmt = $pdo->prepare('SELECT id FROM duty_rooms WHERE id = :id AND roster_id = :r AND exam_date = :d AND time_slot_id = :s');
                $stmt->execute(['id' => $roomId, 'r' => $roster['id'], 'd' => $date, 's' => $slotId]);
                if (!$stmt->fetch()) {
                    throw new HttpException(422, 'VALIDATION', 'That room is not part of this session\'s seating');
                }
            }
            $staff = self::staffOrFail($pdo, $staffId);
            self::confirmWarnings(self::check($pdo, $roster, $staff, $slot), $force);
            $pdo->prepare(
                'INSERT INTO duty_assignments (roster_id, exam_date, time_slot_id, room_id, staff_id, role, is_manual, created_by)
                 VALUES (:r, :d, :s, :room, :staff, :role, 1, :u)'
            )->execute(['r' => $roster['id'], 'd' => $date, 's' => $slotId, 'room' => $roomId, 'staff' => $staffId, 'role' => $role, 'u' => $userId]);
            return (int) $pdo->lastInsertId();
        });
    }

    /** Put another staff member on an existing duty (same slot, same room). */
    public static function replaceAssignment(int $id, int $staffId, bool $force): array
    {
        return Db::transaction(function (PDO $pdo) use ($id, $staffId, $force) {
            $a = self::assignmentOrFail($pdo, $id);
            $roster = self::rosterById($pdo, $a['roster_id'], true);
            self::assertEditable($roster);
            $slot = self::slotOrFail($roster['exam_cycle_id'], $a['exam_date'], $a['time_slot_id'], $pdo);
            $staff = self::staffOrFail($pdo, $staffId);
            if ((int) $staff['id'] === $a['staff_id']) {
                throw new HttpException(422, 'VALIDATION', 'Pick a different staff member');
            }
            self::confirmWarnings(self::check($pdo, $roster, $staff, $slot, [$id]), $force);
            $pdo->prepare('UPDATE duty_assignments SET staff_id = :s, is_manual = 1 WHERE id = :id')->execute(['s' => $staffId, 'id' => $id]);
            return ['old_staff_id' => $a['staff_id'], 'new_staff_id' => $staffId, 'exam_date' => $a['exam_date'], 'time_slot_id' => $a['time_slot_id']];
        });
    }

    /** Exchange the staff of two duties in different slots (each duty keeps its room). */
    public static function swapAssignments(int $aId, int $bId, bool $force): array
    {
        return Db::transaction(function (PDO $pdo) use ($aId, $bId, $force) {
            $a = self::assignmentOrFail($pdo, $aId);
            $b = self::assignmentOrFail($pdo, $bId);
            if ($a['roster_id'] !== $b['roster_id']) {
                throw new HttpException(422, 'VALIDATION', 'Both duties must belong to the same roster');
            }
            if ($a['exam_date'] === $b['exam_date'] && $a['time_slot_id'] === $b['time_slot_id']) {
                throw new HttpException(422, 'VALIDATION', 'Both duties are in the same slot; nothing to swap');
            }
            $roster = self::rosterById($pdo, $a['roster_id'], true);
            self::assertEditable($roster);
            $slotA = self::slotOrFail($roster['exam_cycle_id'], $a['exam_date'], $a['time_slot_id'], $pdo);
            $slotB = self::slotOrFail($roster['exam_cycle_id'], $b['exam_date'], $b['time_slot_id'], $pdo);
            $staffA = self::staffOrFail($pdo, $a['staff_id']);
            $staffB = self::staffOrFail($pdo, $b['staff_id']);
            $warnings = array_merge(
                self::check($pdo, $roster, $staffB, $slotA, [$aId, $bId]),
                self::check($pdo, $roster, $staffA, $slotB, [$aId, $bId]),
            );
            self::confirmWarnings($warnings, $force);
            $upd = $pdo->prepare('UPDATE duty_assignments SET staff_id = :s, is_manual = 1 WHERE id = :id');
            $upd->execute(['s' => $b['staff_id'], 'id' => $aId]);
            $upd->execute(['s' => $a['staff_id'], 'id' => $bId]);
            return ['a' => $aId, 'b' => $bId];
        });
    }

    public static function removeAssignment(int $id): array
    {
        return Db::transaction(function (PDO $pdo) use ($id) {
            $a = self::assignmentOrFail($pdo, $id);
            self::assertEditable(self::rosterById($pdo, $a['roster_id'], true));
            $pdo->prepare('DELETE FROM duty_assignments WHERE id = :id')->execute(['id' => $id]);
            return $a;
        });
    }

    /** Every active staff member with their eligibility for one slot, eligible + least loaded first. */
    public static function candidates(int $cycleId, string $date, int $slotId): array
    {
        $pdo = Db::conn();
        $roster = self::roster($cycleId, $pdo);
        $slot = self::slotOrFail($cycleId, $date, $slotId, $pdo);
        $unavailable = self::unavailabilityMap($pdo, $date, $date);

        $stmt = $pdo->prepare('SELECT staff_id, exam_date, time_slot_id FROM duty_assignments WHERE roster_id = :r');
        $stmt->execute(['r' => $roster['id']]);
        $total = [];
        $sameDay = [];
        $inSlot = [];
        foreach ($stmt->fetchAll() as $a) {
            $sid = (int) $a['staff_id'];
            $total[$sid] = ($total[$sid] ?? 0) + 1;
            if ($a['exam_date'] === $date) {
                $sameDay[$sid] = ($sameDay[$sid] ?? 0) + 1;
                if ((int) $a['time_slot_id'] === $slotId) {
                    $inSlot[$sid] = true;
                }
            }
        }

        $rows = $pdo->query(
            'SELECT s.id, s.employee_code, s.name, s.designation, s.department_id, d.name AS department_name
             FROM staff s LEFT JOIN departments d ON d.id = s.department_id WHERE s.is_active = 1'
        )->fetchAll();
        $out = [];
        foreach ($rows as $s) {
            $sid = (int) $s['id'];
            $flags = [];
            if (isset($inSlot[$sid])) {
                $flags[] = 'On duty in this slot';
            }
            if (($sameDay[$sid] ?? 0) >= $roster['max_per_day']) {
                $flags[] = 'Daily limit reached';
            }
            if (self::isUnavailable($unavailable, $sid, $date, $slotId)) {
                $flags[] = 'Unavailable';
            }
            if ($roster['exclude_own_department'] && $s['department_id'] !== null && in_array((int) $s['department_id'], $slot['department_ids'], true)) {
                $flags[] = 'Own department paper';
            }
            $out[] = [
                'staff_id' => $sid, 'employee_code' => $s['employee_code'], 'name' => $s['name'],
                'designation' => $s['designation'], 'department_name' => $s['department_name'],
                'duties' => $total[$sid] ?? 0, 'flags' => $flags,
                'blocked' => isset($inSlot[$sid]), 'eligible' => !$flags,
            ];
        }
        usort($out, fn ($a, $b) => [$a['blocked'], !$a['eligible'], $a['duties'], $a['name']] <=> [$b['blocked'], !$b['eligible'], $b['duties'], $b['name']]);
        return $out;
    }

    // ---- Unavailability -----------------------------------------------------------------

    public static function listUnavailability(int $cycleId): array
    {
        $pdo = Db::conn();
        $cycle = self::cycle($cycleId, $pdo);
        $stmt = $pdo->prepare(
            'SELECT u.id, u.staff_id, u.date_from, u.date_to, u.time_slot_id, u.reason,
                    s.employee_code, s.name, d.name AS department_name, t.label AS time_slot_label
             FROM staff_unavailability u
             JOIN staff s ON s.id = u.staff_id
             LEFT JOIN departments d ON d.id = s.department_id
             LEFT JOIN time_slots t ON t.id = u.time_slot_id
             WHERE u.date_to >= :f AND u.date_from <= :t
             ORDER BY u.date_from, s.name'
        );
        $stmt->execute(['f' => $cycle['start_date'], 't' => $cycle['end_date']]);
        return $stmt->fetchAll();
    }

    /** @return array{id:int, conflicting_duties:int} */
    public static function addUnavailability(array $data, int $userId): array
    {
        $pdo = Db::conn();
        self::staffOrFail($pdo, $data['staff_id']);
        if ($data['date_to'] < $data['date_from']) {
            throw new HttpException(422, 'VALIDATION', 'Validation failed', ['date_to' => 'Must be on or after the start date']);
        }
        $pdo->prepare(
            'INSERT INTO staff_unavailability (staff_id, date_from, date_to, time_slot_id, reason, created_by)
             VALUES (:staff_id, :date_from, :date_to, :time_slot_id, :reason, :u)'
        )->execute([
            'staff_id' => $data['staff_id'], 'date_from' => $data['date_from'], 'date_to' => $data['date_to'],
            'time_slot_id' => $data['time_slot_id'] ?? null, 'reason' => $data['reason'] ?? null, 'u' => $userId,
        ]);
        $id = (int) $pdo->lastInsertId();

        // Existing duties that now clash, so the Exam Cell knows to regenerate or replace them.
        $sql = 'SELECT COUNT(*) AS c FROM duty_assignments WHERE staff_id = :s AND exam_date BETWEEN :f AND :t';
        $params = ['s' => $data['staff_id'], 'f' => $data['date_from'], 't' => $data['date_to']];
        if (!empty($data['time_slot_id'])) {
            $sql .= ' AND time_slot_id = :slot';
            $params['slot'] = $data['time_slot_id'];
        }
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        return ['id' => $id, 'conflicting_duties' => (int) $stmt->fetch()['c']];
    }

    public static function deleteUnavailability(int $id): void
    {
        $stmt = Db::conn()->prepare('DELETE FROM staff_unavailability WHERE id = :id');
        $stmt->execute(['id' => $id]);
        if ($stmt->rowCount() === 0) {
            throw new HttpException(404, 'NOT_FOUND', 'Unavailability entry not found');
        }
    }
}
