import { httpError } from '../utils/httpError.js';
import { ddmmyyyy } from '../utils/dates.js';

const TYPE_LABEL = { REGULAR: 'Regular', REAPPEAR: 'Re-appear' };

// Must run inside the same transaction/connection as the insert/update that follows,
// so the FOR UPDATE row lock actually prevents a second concurrent request from
// slipping an identical slot in before this one commits.
export async function assertNoClash(conn, { cycleId, programId, programName, semester, examType, date, slotId, excludeId }) {
  const [slotRows] = await conn.execute(
    `SELECT e.id, e.course_name, ts.label FROM exam_entries e
     JOIN time_slots ts ON ts.id = e.time_slot_id
     WHERE e.exam_cycle_id = :cycle AND e.program_id = :prog AND e.semester = :sem
       AND e.exam_type = :type AND e.exam_date = :date AND e.time_slot_id = :slot
       AND e.id <> :self LIMIT 1 FOR UPDATE`,
    { cycle: cycleId, prog: programId, sem: semester, type: examType, date, slot: slotId, self: excludeId ?? 0 },
  );
  if (slotRows.length) {
    const row = slotRows[0];
    throw httpError(
      409,
      'CLASH',
      `Clash: ${programName} Semester ${semester} (${TYPE_LABEL[examType]}) already has "${row.course_name}" on ${ddmmyyyy(date)} at ${row.label}.`,
      { exam_date: 'This date and time slot is already used.' },
    );
  }
}

export async function assertNoDuplicateCourse(conn, { cycleId, programId, semester, examType, courseCode, excludeId }) {
  const [rows] = await conn.execute(
    `SELECT id FROM exam_entries
     WHERE exam_cycle_id = :cycle AND program_id = :prog AND semester = :sem
       AND exam_type = :type AND course_code = :code AND id <> :self LIMIT 1 FOR UPDATE`,
    { cycle: cycleId, prog: programId, sem: semester, type: examType, code: courseCode, self: excludeId ?? 0 },
  );
  if (rows.length) {
    throw httpError(409, 'DUPLICATE_COURSE', `Course code "${courseCode}" already exists for this program, semester and exam type.`, {
      course_code: 'Duplicate course code for this program/semester/type.',
    });
  }
}
