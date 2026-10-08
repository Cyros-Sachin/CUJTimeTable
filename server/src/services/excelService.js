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

export async function buildTemplateWorkbook(examType) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Entries');
  const listsSheet = workbook.addWorksheet('Lists', { state: 'hidden' });

  const [[programs], [timeSlots], [subjectTypes]] = await Promise.all([
    pool.query('SELECT name FROM programs WHERE is_active = 1 ORDER BY name'),
    pool.query('SELECT label FROM time_slots WHERE is_active = 1 ORDER BY start_time'),
    pool.query('SELECT name FROM subject_types WHERE is_active = 1 ORDER BY id'),
  ]);

  programs.forEach((p, i) => { listsSheet.getCell(`A${i + 1}`).value = p.name; });
  subjectTypes.forEach((s, i) => { listsSheet.getCell(`B${i + 1}`).value = s.name; });
  timeSlots.forEach((t, i) => { listsSheet.getCell(`C${i + 1}`).value = t.label; });

  const headers = ['Program', 'Semester', 'Subject Type', 'Date', 'Time Slot', 'Course Code', 'Course Name', 'No. of Students'];
  sheet.columns = headers.map((h) => ({ header: h, width: 22 }));
  styleHeaderRow(sheet.getRow(1));

  sheet.addRow([
    programs[0]?.name || 'M.Sc. Biotechnology', 2, subjectTypes[0]?.name || 'Core',
    new Date(), timeSlots[0]?.label || '2:00PM-5:00PM', 'MBIO1C004T',
    `Sample Course (${examType === 'REAPPEAR' ? 'Re-appear' : 'Regular'})`, 60,
  ]);
  sheet.getCell('D2').numFmt = 'dd-mm-yyyy';

  for (let row = 2; row <= 1001; row += 1) {
    sheet.getCell(`A${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$A$1:$A$${Math.max(programs.length, 1)}`] };
    sheet.getCell(`C${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$B$1:$B$${Math.max(subjectTypes.length, 1)}`] };
    sheet.getCell(`E${row}`).dataValidation = { type: 'list', allowBlank: true, formulae: [`Lists!$C$1:$C$${Math.max(timeSlots.length, 1)}`] };
  }

  sheet.eachRow((row) => row.eachCell((cell) => { cell.border = THIN_BORDER; }));
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
