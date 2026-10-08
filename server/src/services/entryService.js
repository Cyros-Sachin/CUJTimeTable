import { pool, withTransaction } from '../db.js';
import { httpError } from '../utils/httpError.js';
import { isoBetween } from '../utils/dates.js';
import { assertNoClash, assertNoDuplicateCourse } from './clashService.js';
import { writeAudit } from './auditService.js';

async function loadProgram(conn, programId) {
  const [rows] = await conn.execute(
    `SELECT p.id, p.name, p.total_semesters, p.department_id, p.is_active, d.name AS department_name
     FROM programs p JOIN departments d ON d.id = p.department_id WHERE p.id = :id LIMIT 1`,
    { id: programId },
  );
  if (!rows[0]) throw httpError(422, 'VALIDATION', 'Unknown program', { program_id: 'Program not found' });
  return rows[0];
}

async function loadCycle(conn, cycleId) {
  const [rows] = await conn.execute(
    `SELECT id, title, month_year, start_date, end_date, status FROM exam_cycles WHERE id = :id LIMIT 1`,
    { id: cycleId },
  );
  if (!rows[0]) throw httpError(422, 'VALIDATION', 'Unknown exam cycle', { exam_cycle_id: 'Cycle not found' });
  return rows[0];
}

async function loadTimeSlot(conn, slotId) {
  const [rows] = await conn.execute('SELECT id, label FROM time_slots WHERE id = :id LIMIT 1', { id: slotId });
  if (!rows[0]) throw httpError(422, 'VALIDATION', 'Unknown time slot', { time_slot_id: 'Time slot not found' });
  return rows[0];
}

function assertDepartmentScope(user, departmentId) {
  if (user.role === 'DEPT_COORDINATOR' && departmentId !== user.departmentId) {
    throw httpError(404, 'NOT_FOUND', 'Entry not found');
  }
}

function resolveDepartmentId(user, bodyDepartmentId) {
  if (user.role === 'DEPT_COORDINATOR') return user.departmentId;
  if (!bodyDepartmentId) throw httpError(422, 'VALIDATION', 'department_id is required', { department_id: 'Required' });
  return bodyDepartmentId;
}

export async function validateEntryBusinessRules(conn, { departmentId, program, cycle, semester, examDate }) {
  if (program.department_id !== departmentId) {
    throw httpError(422, 'VALIDATION', 'Program does not belong to this department', { program_id: 'Program/department mismatch' });
  }
  if (semester < 1 || semester > program.total_semesters) {
    throw httpError(422, 'VALIDATION', 'Semester out of range for this program', { semester: `Must be between 1 and ${program.total_semesters}` });
  }
  if (!isoBetween(examDate, cycle.start_date, cycle.end_date)) {
    throw httpError(422, 'VALIDATION', 'Date is outside the exam cycle window', { exam_date: `Must be between ${cycle.start_date} and ${cycle.end_date}` });
  }
}

export async function createEntry(user, body, ip) {
  return withTransaction(async (conn) => {
    const departmentId = resolveDepartmentId(user, body.department_id);
    const [program, cycle, slot] = await Promise.all([
      loadProgram(conn, body.program_id),
      loadCycle(conn, body.exam_cycle_id),
      loadTimeSlot(conn, body.time_slot_id),
    ]);

    if (cycle.status === 'LOCKED' && user.role === 'DEPT_COORDINATOR') {
      throw httpError(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
    }

    await validateEntryBusinessRules(conn, { departmentId, program, cycle, semester: body.semester, examDate: body.exam_date });
    await assertNoClash(conn, {
      cycleId: body.exam_cycle_id, programId: body.program_id, programName: program.name,
      semester: body.semester, examType: body.exam_type, date: body.exam_date, slotId: body.time_slot_id,
    });
    await assertNoDuplicateCourse(conn, {
      cycleId: body.exam_cycle_id, programId: body.program_id, semester: body.semester,
      examType: body.exam_type, courseCode: body.course_code,
    });

    const [result] = await conn.execute(
      `INSERT INTO exam_entries
        (exam_cycle_id, department_id, program_id, semester, exam_type, subject_type_id, time_slot_id,
         exam_date, course_code, course_name, student_count, created_by)
       VALUES (:cycle, :dept, :prog, :sem, :type, :stype, :slot, :date, :code, :name, :students, :by)`,
      {
        cycle: body.exam_cycle_id, dept: departmentId, prog: body.program_id, sem: body.semester,
        type: body.exam_type, stype: body.subject_type_id, slot: body.time_slot_id, date: body.exam_date,
        code: body.course_code, name: body.course_name, students: body.student_count, by: user.id,
      },
    );

    await writeAudit({ userId: user.id, action: 'ENTRY_CREATE', entity: 'exam_entries', entityId: result.insertId, details: body, ip }, conn);
    return getEntryById(user, result.insertId, conn);
  });
}

export async function updateEntry(user, id, body, ip) {
  return withTransaction(async (conn) => {
    const [existingRows] = await conn.execute('SELECT * FROM exam_entries WHERE id = :id LIMIT 1 FOR UPDATE', { id });
    const existing = existingRows[0];
    if (!existing) throw httpError(404, 'NOT_FOUND', 'Entry not found');
    assertDepartmentScope(user, existing.department_id);

    const departmentId = user.role === 'DEPT_COORDINATOR' ? user.departmentId : (body.department_id || existing.department_id);
    const [program, cycle, slot] = await Promise.all([
      loadProgram(conn, body.program_id ?? existing.program_id),
      loadCycle(conn, body.exam_cycle_id ?? existing.exam_cycle_id),
      loadTimeSlot(conn, body.time_slot_id ?? existing.time_slot_id),
    ]);

    if (cycle.status === 'LOCKED' && user.role === 'DEPT_COORDINATOR') {
      throw httpError(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
    }

    const merged = {
      exam_cycle_id: body.exam_cycle_id ?? existing.exam_cycle_id,
      program_id: body.program_id ?? existing.program_id,
      semester: body.semester ?? existing.semester,
      exam_type: body.exam_type ?? existing.exam_type,
      subject_type_id: body.subject_type_id ?? existing.subject_type_id,
      time_slot_id: body.time_slot_id ?? existing.time_slot_id,
      exam_date: body.exam_date ?? existing.exam_date,
      course_code: body.course_code ?? existing.course_code,
      course_name: body.course_name ?? existing.course_name,
      student_count: body.student_count ?? existing.student_count,
    };

    await validateEntryBusinessRules(conn, { departmentId, program, cycle, semester: merged.semester, examDate: merged.exam_date });
    await assertNoClash(conn, {
      cycleId: merged.exam_cycle_id, programId: merged.program_id, programName: program.name,
      semester: merged.semester, examType: merged.exam_type, date: merged.exam_date, slotId: merged.time_slot_id,
      excludeId: id,
    });
    await assertNoDuplicateCourse(conn, {
      cycleId: merged.exam_cycle_id, programId: merged.program_id, semester: merged.semester,
      examType: merged.exam_type, courseCode: merged.course_code, excludeId: id,
    });

    await conn.execute(
      `UPDATE exam_entries SET
        exam_cycle_id = :cycle, department_id = :dept, program_id = :prog, semester = :sem, exam_type = :type,
        subject_type_id = :stype, time_slot_id = :slot, exam_date = :date, course_code = :code,
        course_name = :name, student_count = :students, updated_by = :by
       WHERE id = :id`,
      {
        cycle: merged.exam_cycle_id, dept: departmentId, prog: merged.program_id, sem: merged.semester,
        type: merged.exam_type, stype: merged.subject_type_id, slot: merged.time_slot_id, date: merged.exam_date,
        code: merged.course_code, name: merged.course_name, students: merged.student_count, by: user.id, id,
      },
    );

    await writeAudit({ userId: user.id, action: 'ENTRY_UPDATE', entity: 'exam_entries', entityId: id, details: merged, ip }, conn);
    return getEntryById(user, id, conn);
  });
}

export async function deleteEntry(user, id, ip) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.execute('SELECT * FROM exam_entries WHERE id = :id LIMIT 1 FOR UPDATE', { id });
    const existing = rows[0];
    if (!existing) throw httpError(404, 'NOT_FOUND', 'Entry not found');
    assertDepartmentScope(user, existing.department_id);

    if (user.role === 'DEPT_COORDINATOR') {
      const [cycleRows] = await conn.execute('SELECT status FROM exam_cycles WHERE id = :id', { id: existing.exam_cycle_id });
      if (cycleRows[0]?.status === 'LOCKED') throw httpError(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
    }

    await conn.execute('DELETE FROM exam_entries WHERE id = :id', { id });
    await writeAudit({ userId: user.id, action: 'ENTRY_DELETE', entity: 'exam_entries', entityId: id, details: existing, ip }, conn);
  });
}

export async function checkClash(user, body) {
  return withTransaction(async (conn) => {
    const departmentId = resolveDepartmentId(user, body.department_id);
    const [program, cycle] = await Promise.all([
      loadProgram(conn, body.program_id),
      loadCycle(conn, body.exam_cycle_id),
    ]);
    await validateEntryBusinessRules(conn, { departmentId, program, cycle, semester: body.semester, examDate: body.exam_date });
    await assertNoClash(conn, {
      cycleId: body.exam_cycle_id, programId: body.program_id, programName: program.name,
      semester: body.semester, examType: body.exam_type, date: body.exam_date, slotId: body.time_slot_id,
      excludeId: body.exclude_id,
    });
    await assertNoDuplicateCourse(conn, {
      cycleId: body.exam_cycle_id, programId: body.program_id, semester: body.semester,
      examType: body.exam_type, courseCode: body.course_code, excludeId: body.exclude_id,
    });
    return { ok: true };
  });
}

const ENTRY_SELECT = `
  SELECT e.id, e.exam_cycle_id, e.department_id, e.program_id, e.semester, e.exam_type,
         e.subject_type_id, e.time_slot_id, e.exam_date, e.course_code, e.course_name,
         e.student_count, e.created_at, e.updated_at,
         d.name AS department_name, d.code AS department_code,
         p.name AS program_name, p.code AS program_code,
         st.name AS subject_type_name,
         ts.label AS time_slot_label, ts.start_time,
         ec.title AS cycle_title, ec.month_year AS cycle_month_year
  FROM exam_entries e
  JOIN departments d ON d.id = e.department_id
  JOIN programs p ON p.id = e.program_id
  JOIN subject_types st ON st.id = e.subject_type_id
  JOIN time_slots ts ON ts.id = e.time_slot_id
  JOIN exam_cycles ec ON ec.id = e.exam_cycle_id
`;

export async function getEntryById(user, id, conn = pool) {
  const [rows] = await conn.execute(`${ENTRY_SELECT} WHERE e.id = :id LIMIT 1`, { id });
  const row = rows[0];
  if (!row) throw httpError(404, 'NOT_FOUND', 'Entry not found');
  assertDepartmentScope(user, row.department_id);
  return row;
}

function buildEntryWhere(user, filters) {
  const where = ['1=1'];
  const params = {};

  const deptScope = user.role === 'DEPT_COORDINATOR' ? user.departmentId : filters.department_id;
  if (deptScope) { where.push('e.department_id = :deptScope'); params.deptScope = deptScope; }

  if (filters.cycle_id) { where.push('e.exam_cycle_id = :cycleId'); params.cycleId = filters.cycle_id; }
  if (filters.exam_type) { where.push('e.exam_type = :examType'); params.examType = filters.exam_type; }
  if (filters.program_id) { where.push('e.program_id = :programId'); params.programId = filters.program_id; }
  if (filters.semester) { where.push('e.semester = :semester'); params.semester = filters.semester; }
  if (filters.date_from) { where.push('e.exam_date >= :dateFrom'); params.dateFrom = filters.date_from; }
  if (filters.date_to) { where.push('e.exam_date <= :dateTo'); params.dateTo = filters.date_to; }
  if (filters.q) {
    where.push('(e.course_code LIKE :q OR e.course_name LIKE :q)');
    params.q = `%${filters.q}%`;
  }

  return { whereSql: where.join(' AND '), params };
}

export async function listAllEntriesForExport(user, filters) {
  const { whereSql, params } = buildEntryWhere(user, filters);
  const [rows] = await pool.query(
    `${ENTRY_SELECT} WHERE ${whereSql} ORDER BY e.exam_date ASC, ts.start_time ASC, d.name ASC`,
    params,
  );
  return rows;
}

export async function listEntries(user, filters) {
  const { whereSql, params } = buildEntryWhere(user, filters);
  const page = filters.page || 1;
  const pageSize = Math.min(filters.page_size || 20, 100);
  const offset = (page - 1) * pageSize;

  const sortMap = {
    date: 'e.exam_date ASC, ts.start_time ASC',
    '-date': 'e.exam_date DESC, ts.start_time DESC',
    created: 'e.created_at DESC',
  };
  const orderBy = sortMap[filters.sort] || sortMap.date;

  const [rows] = await pool.query(
    `${ENTRY_SELECT} WHERE ${whereSql} ORDER BY ${orderBy} LIMIT :limit OFFSET :offset`,
    { ...params, limit: pageSize, offset },
  );
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM exam_entries e WHERE ${whereSql}`,
    params,
  );

  return { rows, total: Number(total), page, pageSize };
}
