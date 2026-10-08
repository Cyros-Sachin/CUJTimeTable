import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import { pool, withTransaction } from '../db.js';
import { httpError } from '../utils/httpError.js';
import { isoBetween } from '../utils/dates.js';
import { assertNoClash, assertNoDuplicateCourse } from './clashService.js';
import { writeAudit } from './auditService.js';

const REQUIRED_HEADERS = ['Program', 'Semester', 'Subject Type', 'Date', 'Time Slot', 'Course Code', 'Course Name', 'No. of Students'];
const COURSE_CODE_REGEX = /^[A-Z0-9][A-Z0-9\-_/ ]{2,29}$/;
const MAX_ROWS = 1000;

function cellToText(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (typeof v === 'object' && Array.isArray(v.richText)) return v.richText.map((t) => t.text).join('');
  if (typeof v === 'object' && v.result !== undefined) return String(v.result);
  if (typeof v === 'object' && v.text !== undefined) return String(v.text);
  return String(v).trim();
}

function cellToIsoDate(cell) {
  const v = cell?.value;
  if (v instanceof Date) {
    return `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}`;
  }
  const text = cellToText(cell).trim();
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  if (match) return `${match[3]}-${match[2]}-${match[1]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return null;
}

async function loadWorkbook(file) {
  const workbook = new ExcelJS.Workbook();
  const isCsv = /\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv';
  if (isCsv) {
    await workbook.csv.read(Readable.from(file.buffer));
  } else {
    const signature = file.buffer.subarray(0, 2).toString('latin1');
    if (signature !== 'PK') throw httpError(422, 'UPLOAD_INVALID', 'File is not a valid .xlsx workbook', { rows: [] });
    await workbook.xlsx.load(file.buffer);
  }
  return workbook;
}

export async function parseAndValidateUpload({ file, examCycleId, examType, departmentId, user }) {
  const workbook = await loadWorkbook(file);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw httpError(422, 'UPLOAD_INVALID', 'Workbook has no sheets', { rows: [] });

  const headerRow = sheet.getRow(1);
  const headerCells = REQUIRED_HEADERS.map((_, i) => cellToText(headerRow.getCell(i + 1)).toLowerCase());
  const headersOk = REQUIRED_HEADERS.every((h, i) => headerCells[i] === h.toLowerCase());
  if (!headersOk) {
    throw httpError(422, 'UPLOAD_INVALID', 'Header row does not match the required template', {
      rows: [{ row: 1, field: 'header', message: `Expected columns: ${REQUIRED_HEADERS.join(', ')}` }],
    });
  }

  const [[programs], [timeSlots], [subjectTypes], [cycleRows]] = await Promise.all([
    pool.query('SELECT id, code, name, department_id, total_semesters FROM programs WHERE is_active = 1'),
    pool.query('SELECT id, label FROM time_slots WHERE is_active = 1'),
    pool.query('SELECT id, name FROM subject_types WHERE is_active = 1'),
    pool.query('SELECT id, start_date, end_date, status FROM exam_cycles WHERE id = :id', { id: examCycleId }),
  ]);
  const cycle = cycleRows[0];
  if (!cycle) throw httpError(422, 'VALIDATION', 'Unknown exam cycle', { exam_cycle_id: 'Cycle not found' });
  if (cycle.status === 'LOCKED' && user.role === 'DEPT_COORDINATOR') {
    throw httpError(403, 'CYCLE_LOCKED', 'This exam cycle is locked');
  }

  const programByName = new Map(programs.filter((p) => p.department_id === departmentId).map((p) => [p.name.toLowerCase(), p]));
  const programByCode = new Map(programs.filter((p) => p.department_id === departmentId).map((p) => [p.code.toLowerCase(), p]));
  const slotByLabel = new Map(timeSlots.map((t) => [t.label.toLowerCase(), t]));
  const stypeByName = new Map(subjectTypes.map((s) => [s.name.toLowerCase(), s]));

  const rows = [];
  const errors = [];
  const seenInFile = new Set();
  const seenCourseInFile = new Set();

  let rowCount = 0;
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    if (row.cellCount === 0 || !row.values || row.values.every((v) => v == null || v === '')) continue;
    rowCount += 1;
    if (rowCount > MAX_ROWS) {
      errors.push({ row: r, field: 'file', message: `Too many rows (max ${MAX_ROWS})` });
      break;
    }

    const programText = cellToText(row.getCell(1));
    const semesterText = cellToText(row.getCell(2));
    const subjectTypeText = cellToText(row.getCell(3));
    const isoDate = cellToIsoDate(row.getCell(4));
    const slotText = cellToText(row.getCell(5));
    const courseCode = cellToText(row.getCell(6)).trim().toUpperCase();
    const courseName = cellToText(row.getCell(7)).trim();
    const studentsText = cellToText(row.getCell(8));

    const program = programByName.get(programText.toLowerCase()) || programByCode.get(programText.toLowerCase());
    const slot = slotByLabel.get(slotText.toLowerCase());
    const subjectType = stypeByName.get(subjectTypeText.toLowerCase());
    const semester = Number(semesterText);
    const studentCount = Number(studentsText);

    const rowErr = (field, message) => errors.push({ row: r, field, message });

    if (!program) rowErr('program', `Unknown program "${programText}" for this department`);
    if (!Number.isInteger(semester) || semester < 1 || (program && semester > program.total_semesters)) {
      rowErr('semester', `Semester must be between 1 and ${program ? program.total_semesters : '?'}`);
    }
    if (!subjectType) rowErr('subject_type', `Unknown subject type "${subjectTypeText}"`);
    if (!isoDate) rowErr('exam_date', 'Date must be DD-MM-YYYY or a real Excel date');
    else if (!isoBetween(isoDate, cycle.start_date, cycle.end_date)) rowErr('exam_date', `Date must be within ${cycle.start_date} and ${cycle.end_date}`);
    if (!slot) rowErr('time_slot', `Unknown time slot "${slotText}"`);
    if (!COURSE_CODE_REGEX.test(courseCode)) rowErr('course_code', 'Invalid course code format');
    if (courseName.length < 2 || courseName.length > 200) rowErr('course_name', 'Course name must be 2-200 characters');
    if (!Number.isInteger(studentCount) || studentCount < 1 || studentCount > 5000) rowErr('student_count', 'No. of Students must be an integer between 1 and 5000');

    if (program && slot && isoDate) {
      const slotKey = `${program.id}|${semester}|${examType}|${isoDate}|${slot.id}`;
      if (seenInFile.has(slotKey)) rowErr('exam_date', 'Duplicate slot within this file');
      seenInFile.add(slotKey);
    }
    if (program && courseCode) {
      const courseKey = `${program.id}|${semester}|${examType}|${courseCode}`;
      if (seenCourseInFile.has(courseKey)) rowErr('course_code', 'Duplicate course code within this file');
      seenCourseInFile.add(courseKey);
    }

    rows.push({
      row: r, program_id: program?.id, program_name: program?.name, semester, subject_type_id: subjectType?.id,
      exam_date: isoDate, time_slot_id: slot?.id, time_slot_label: slot?.label, course_code: courseCode,
      course_name: courseName, student_count: studentCount,
    });
  }

  if (rowCount === 0) {
    throw httpError(422, 'UPLOAD_INVALID', 'No data rows found', { rows: [{ row: 2, field: 'file', message: 'File has no data rows' }] });
  }

  return { rows, errors, cycle };
}

export async function insertUpload({ rows, examCycleId, examType, departmentId, user, ip }) {
  return withTransaction(async (conn) => {
    const inserted = [];
    for (const row of rows) {
      await assertNoClash(conn, {
        cycleId: examCycleId, programId: row.program_id, programName: row.program_name, semester: row.semester,
        examType, date: row.exam_date, slotId: row.time_slot_id,
      });
      await assertNoDuplicateCourse(conn, {
        cycleId: examCycleId, programId: row.program_id, semester: row.semester, examType, courseCode: row.course_code,
      });
      const [result] = await conn.execute(
        `INSERT INTO exam_entries
          (exam_cycle_id, department_id, program_id, semester, exam_type, subject_type_id, time_slot_id,
           exam_date, course_code, course_name, student_count, created_by)
         VALUES (:cycle, :dept, :prog, :sem, :type, :stype, :slot, :date, :code, :name, :students, :by)`,
        {
          cycle: examCycleId, dept: departmentId, prog: row.program_id, sem: row.semester, type: examType,
          stype: row.subject_type_id, slot: row.time_slot_id, date: row.exam_date, code: row.course_code,
          name: row.course_name, students: row.student_count, by: user.id,
        },
      );
      inserted.push(result.insertId);
    }
    await writeAudit({
      userId: user.id, action: 'ENTRY_BULK_UPLOAD', entity: 'exam_entries',
      details: { count: inserted.length, examCycleId, examType, departmentId }, ip,
    }, conn);
    return inserted;
  });
}
