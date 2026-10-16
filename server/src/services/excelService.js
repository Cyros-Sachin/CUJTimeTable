import ExcelJS from 'exceljs';
import { pool } from '../db.js';

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };
const THIN_BORDER = {
  top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' },
};

function styleHeaderRow(row) {
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = THIN_BORDER;
  });
  row.height = 20;
}

function sanitizeSheetName(name) {
  return name.replace(/[*?:/\\[\]]/g, '').slice(0, 31) || 'Sheet';
}

function excelDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDatesBetween(startIso, endIso) {
  const out = [];
  const end = excelDate(endIso).getTime();
  for (let t = excelDate(startIso).getTime(); t <= end && out.length < 400; t += 86400000) {
    const d = new Date(t);
    out.push(`${String(d.getUTCDate()).padStart(2, '0')}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${d.getUTCFullYear()}`);
  }
  return out;
}

/**
 * Entry upload template. Every choice column (Program, Semester, Subject Type,
 * Date, Time Slot) is a dropdown fed from live data: the programs of the given
 * department, the semesters those programs have, Core/Elective, the exam cycle's
 * date window, and the active time slots. Dates are plain DD-MM-YYYY text so the
 * dropdown value is never re-interpreted by Excel's locale.
 */
export async function buildTemplateWorkbook({ examType, cycleId, departmentId, programId }) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Entries', { views: [{ state: 'frozen', ySplit: 1 }] });
  const listsSheet = workbook.addWorksheet('Lists', { state: 'hidden' });
  const guide = workbook.addWorksheet('Instructions');

  const [[programs], [timeSlots], [subjectTypes], [cycleRows], [deptRows]] = await Promise.all([
    pool.query(
      `SELECT name, total_semesters FROM programs WHERE is_active = 1
         ${departmentId ? 'AND department_id = :dept' : ''} ${programId ? 'AND id = :prog' : ''} ORDER BY name`,
      { dept: departmentId, prog: programId },
    ),
    pool.query('SELECT label FROM time_slots WHERE is_active = 1 ORDER BY start_time'),
    pool.query('SELECT name FROM subject_types WHERE is_active = 1 ORDER BY id'),
    pool.query('SELECT title, month_year, start_date, end_date FROM exam_cycles WHERE id = :id', { id: cycleId || 0 }),
    pool.query('SELECT name FROM departments WHERE id = :id', { id: departmentId || 0 }),
  ]);
  const cycle = cycleRows[0];
  const dates = cycle ? isoDatesBetween(cycle.start_date, cycle.end_date) : [];
  // A single program (chosen, or the department only has one) is pre-filled and locked.
  const locked = programs.length === 1;
  const maxSemester = Math.max(1, ...programs.map((p) => p.total_semesters));
  const semesters = Array.from({ length: maxSemester }, (_, i) => i + 1);

  programs.forEach((p, i) => {
    listsSheet.getCell(`A${i + 1}`).value = p.name;
    listsSheet.getCell(`F${i + 1}`).value = p.total_semesters;
  });
  subjectTypes.forEach((s, i) => { listsSheet.getCell(`B${i + 1}`).value = s.name; });
  timeSlots.forEach((t, i) => { listsSheet.getCell(`C${i + 1}`).value = t.label; });
  dates.forEach((d, i) => { listsSheet.getCell(`D${i + 1}`).value = d; });
  semesters.forEach((n, i) => { listsSheet.getCell(`E${i + 1}`).value = n; });

  const headers = ['Program', 'Semester', 'Subject Type', 'Date', 'Time Slot', 'Course Code', 'Course Name', 'No. of Students'];
  sheet.columns = headers.map((h) => ({ header: h, width: h === 'Course Name' ? 36 : 22 }));
  styleHeaderRow(sheet.getRow(1));

  const strict = (ref, count, title) => ({
    type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'stop', errorTitle: title,
    error: `Pick a value from the dropdown list.`, formulae: [`Lists!$${ref}$1:$${ref}$${Math.max(count, 1)}`],
  });
  const programCount = Math.max(programs.length, 1);
  for (let row = 2; row <= 1001; row += 1) {
    if (locked) {
      sheet.getCell(`A${row}`).value = programs[0].name;
      sheet.getCell(`A${row}`).protection = { locked: true };
    } else {
      sheet.getCell(`A${row}`).dataValidation = strict('A', programs.length, 'Program');
    }
    // Semester choices follow the program on the same row (each program's own semester count).
    sheet.getCell(`B${row}`).dataValidation = locked
      ? strict('E', programs[0].total_semesters, 'Semester')
      : {
        type: 'list', allowBlank: true, showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Semester',
        error: 'Pick the Program first, then a semester from the dropdown.',
        formulae: [`OFFSET(Lists!$E$1,0,0,INDEX(Lists!$F$1:$F$${programCount},MATCH($A${row},Lists!$A$1:$A$${programCount},0)),1)`],
      };
    for (const col of ['B', 'C', 'D', 'E', 'F', 'G', 'H']) sheet.getCell(`${col}${row}`).protection = { locked: false };
    sheet.getCell(`C${row}`).dataValidation = strict('B', subjectTypes.length, 'Subject Type');
    sheet.getCell(`D${row}`).dataValidation = strict('D', dates.length, 'Date');
    sheet.getCell(`D${row}`).numFmt = '@';
    sheet.getCell(`E${row}`).dataValidation = strict('C', timeSlots.length, 'Time Slot');
    sheet.getCell(`G${row}`).alignment = { wrapText: false };
    sheet.getCell(`H${row}`).dataValidation = {
      type: 'whole', operator: 'between', allowBlank: true, showErrorMessage: true, errorTitle: 'No. of Students',
      error: 'Enter a whole number between 1 and 5000.', formulae: [1, 5000],
    };
  }

  if (locked) {
    await sheet.protect('', { selectLockedCells: true, selectUnlockedCells: true, formatColumns: true, formatRows: true });
  }

  guide.getColumn(1).width = 110;
  const lines = [
    `Exam cycle: ${cycle ? `${cycle.title} - ${cycle.month_year} (${dates[0]} to ${dates[dates.length - 1]})` : 'not specified'}`,
    `Department: ${deptRows[0]?.name || 'all departments'}`,
    locked ? `Program: ${programs[0].name} (pre-filled and locked - do not change)` : 'Program: pick from the dropdown (only programs you are allowed to upload for are listed)',
    `Exam type: ${examType === 'REAPPEAR' ? 'Re-appear' : 'Regular'}`,
    '',
    'Fill one exam per row from row 2 downward.',
    'Program, Semester, Subject Type, Date and Time Slot are dropdowns - pick the value, do not type it.',
    'Semester choices depend on the Program of the same row. Only Course Code, Course Name and No. of Students are typed.',
    'Rows with a program from another department are rejected on upload.',
    'Date list contains only the dates of the selected exam cycle.',
    'Course Code: letters/digits, e.g. MBIO1C004T. Course Name: 2-200 characters.',
    'No. of Students: whole number 1-5000.',
    'Do not rename or reorder the header row. Max 1000 rows. Upload the file under the same exam type and cycle.',
    'Download a fresh template if programs, time slots or the cycle dates change.',
  ];
  lines.forEach((t) => guide.addRow([t]));
  guide.getRow(1).font = { bold: true };

  sheet.getRow(1).eachCell((cell) => { cell.border = THIN_BORDER; });
  return workbook;
}

export async function buildConsolidatedWorkbook({ cycleLabel, rows, dayWise, byDepartment }) {
  const workbook = new ExcelJS.Workbook();

  const consolidated = workbook.addWorksheet('Consolidated', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = ['S.No', 'Date', 'Day', 'Time', 'Department', 'Program', 'Semester', 'Exam Type', 'Subject Type', 'Course Code', 'Course Name', 'No. of Students'];
  consolidated.columns = headers.map((h) => ({ header: h, width: h === 'Course Name' ? 30 : 16 }));
  styleHeaderRow(consolidated.getRow(1));
  consolidated.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headers.length)}1` };

  rows.forEach((r, i) => {
    const row = consolidated.addRow([
      i + 1, excelDate(r.exam_date), r.weekday, r.time_slot_label, r.department_name, r.program_name,
      r.semester, r.exam_type === 'REGULAR' ? 'Regular' : 'Re-appear', r.subject_type_name,
      r.course_code, r.course_name, r.student_count,
    ]);
    row.getCell(2).numFmt = 'dd-mm-yyyy';
    row.eachCell((cell) => { cell.border = THIN_BORDER; });
  });

  const dayWiseSheet = workbook.addWorksheet('Day-wise Summary');
  dayWiseSheet.columns = ['Date', 'Day', 'Time', 'No. of Papers', 'Total Students', 'Departments Involved']
    .map((h) => ({ header: h, width: h === 'Departments Involved' ? 36 : 18 }));
  styleHeaderRow(dayWiseSheet.getRow(1));
  dayWise.forEach((d) => {
    const row = dayWiseSheet.addRow([excelDate(d.exam_date), d.weekday, d.time_slot_label, d.paper_count, d.total_students, d.departments.join(', ')]);
    row.getCell(1).numFmt = 'dd-mm-yyyy';
    row.eachCell((cell) => { cell.border = THIN_BORDER; });
  });

  for (const [deptName, deptRows] of Object.entries(byDepartment)) {
    const sheet = workbook.addWorksheet(sanitizeSheetName(deptName));
    sheet.columns = headers.slice(1).map((h) => ({ header: h, width: h === 'Course Name' ? 30 : 16 }));
    styleHeaderRow(sheet.getRow(1));
    deptRows.forEach((r) => {
      const row = sheet.addRow([
        excelDate(r.exam_date), r.weekday, r.time_slot_label, r.department_name, r.program_name,
        r.semester, r.exam_type === 'REGULAR' ? 'Regular' : 'Re-appear', r.subject_type_name,
        r.course_code, r.course_name, r.student_count,
      ]);
      row.getCell(1).numFmt = 'dd-mm-yyyy';
      row.eachCell((cell) => { cell.border = THIN_BORDER; });
    });
  }

  return workbook;
}
