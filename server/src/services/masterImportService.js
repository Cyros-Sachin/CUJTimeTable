import ExcelJS from 'exceljs';
import { pool, withTransaction } from '../db.js';
import { httpError } from '../utils/httpError.js';
import { cellToText, loadWorkbook } from './uploadService.js';

const MAX_ROWS = 1000;
const DEPT_HEADERS = ['Code', 'Name'];
const PROGRAM_HEADERS = ['Department', 'Code', 'Name', 'Total Semesters'];

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };

function styleHeader(sheet, headers) {
  sheet.columns = headers.map((h) => ({ header: h, width: h === 'Name' || h === 'Department' ? 44 : 20 }));
  sheet.getRow(1).eachCell((cell) => { cell.fill = HEADER_FILL; cell.font = HEADER_FONT; });
}

function addNotes(wb, lines) {
  const notes = wb.addWorksheet('Instructions');
  notes.getColumn(1).width = 90;
  lines.forEach((t) => notes.addRow([t]));
}

export async function buildDepartmentsTemplate() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Departments');
  styleHeader(sheet, DEPT_HEADERS);
  sheet.addRow(['CSIT', 'Department of Computer Science and Information Technology']);
  addNotes(wb, [
    'One department per row, starting on row 2 (row 2 is an example - replace or delete it).',
    'Code: unique short code, up to 20 characters.',
    'Name: full department name, up to 200 characters (printed on the date sheet).',
    'Departments whose code already exists are skipped.',
  ]);
  return wb;
}

export async function buildProgramsTemplate() {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Programs');
  const lists = wb.addWorksheet('Lists', { state: 'hidden' });
  const [depts] = await pool.query('SELECT code, name FROM departments WHERE is_active = 1 ORDER BY name');
  depts.forEach((d, i) => { lists.getCell(`A${i + 1}`).value = d.code; });
  styleHeader(sheet, PROGRAM_HEADERS);
  sheet.addRow([depts[0]?.code || 'CSIT', 'BTECH-CS', 'B.Tech Computer Science', 8]);
  for (let r = 2; r <= 1001; r += 1) {
    sheet.getCell(`A${r}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: [`Lists!$A$1:$A$${Math.max(depts.length, 1)}`],
    };
    sheet.getCell(`D${r}`).dataValidation = { type: 'whole', operator: 'between', allowBlank: true, formulae: [1, 20] };
  }
  addNotes(wb, [
    'One program per row, starting on row 2 (row 2 is an example - replace or delete it).',
    'Department: pick from the dropdown (department code). The full department name is also accepted.',
    'Code: unique program code, up to 30 characters.',
    'Name: program name, up to 200 characters, unique within the department.',
    'Total Semesters: whole number 1-20.',
    'Programs whose code already exists are skipped.',
  ]);
  return wb;
}

async function readRows(file, headers) {
  const wb = await loadWorkbook(file);
  const sheet = wb.worksheets[0];
  if (!sheet) throw httpError(422, 'UPLOAD_INVALID', 'Workbook has no sheets', { rows: [] });
  const ok = headers.every((h, i) => cellToText(sheet.getRow(1).getCell(i + 1)).trim().toLowerCase() === h.toLowerCase());
  if (!ok) {
    throw httpError(422, 'UPLOAD_INVALID', 'Header row does not match the template', {
      rows: [{ row: 1, field: 'header', message: `Expected columns: ${headers.join(', ')}` }],
    });
  }
  const out = [];
  for (let r = 2; r <= sheet.rowCount; r += 1) {
    const cells = headers.map((_, i) => cellToText(sheet.getRow(r).getCell(i + 1)).trim());
    if (cells.every((c) => c === '')) continue;
    out.push({ row: r, cells });
    if (out.length > MAX_ROWS) throw httpError(422, 'UPLOAD_INVALID', `Too many rows (max ${MAX_ROWS})`, { rows: [] });
  }
  if (!out.length) {
    throw httpError(422, 'UPLOAD_INVALID', 'No data rows found', { rows: [{ row: 2, field: 'file', message: 'File has no data rows' }] });
  }
  return out;
}

export async function importDepartments(file, { dryRun }) {
  const raw = await readRows(file, DEPT_HEADERS);
  const [existing] = await pool.query('SELECT code, name FROM departments');
  const codes = new Set(existing.map((d) => d.code.toLowerCase()));
  const names = new Set(existing.map((d) => d.name.toLowerCase()));
  const errors = [];
  const toInsert = [];
  let skipped = 0;
  const seen = new Set();
  for (const { row, cells: [code, name] } of raw) {
    const err = (field, message) => errors.push({ row, field, message });
    if (!code || code.length > 20) err('code', 'Code is required (max 20 characters)');
    if (!name || name.length > 200) err('name', 'Name is required (max 200 characters)');
    if (!code || !name || code.length > 20 || name.length > 200) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) { err('code', 'Duplicate code within this file'); continue; }
    seen.add(key);
    if (codes.has(key)) { skipped += 1; continue; }
    const nameKey = name.toLowerCase();
    if (names.has(nameKey)) { err('name', `A department named "${name}" already exists`); continue; }
    names.add(nameKey);
    toInsert.push({ code, name });
  }
  if (errors.length) throw httpError(422, 'UPLOAD_INVALID', `${errors.length} row(s) failed validation`, { rows: errors });
  if (dryRun) return { valid: toInsert.length, skipped, inserted: 0 };
  await withTransaction(async (conn) => {
    for (const d of toInsert) await conn.execute('INSERT INTO departments (code, name) VALUES (:code, :name)', d);
  });
  return { valid: toInsert.length, skipped, inserted: toInsert.length };
}

export async function importPrograms(file, { dryRun }) {
  const raw = await readRows(file, PROGRAM_HEADERS);
  const [depts] = await pool.query('SELECT id, code, name FROM departments WHERE is_active = 1');
  const deptLookup = new Map();
  depts.forEach((d) => { deptLookup.set(d.code.toLowerCase(), d); deptLookup.set(d.name.toLowerCase(), d); });
  const [existing] = await pool.query('SELECT code, department_id, name FROM programs');
  const codes = new Set(existing.map((p) => p.code.toLowerCase()));
  const deptNames = new Set(existing.map((p) => `${p.department_id}|${p.name.toLowerCase()}`));
  const errors = [];
  const toInsert = [];
  let skipped = 0;
  const seen = new Set();
  for (const { row, cells: [deptText, code, name, semText] } of raw) {
    const err = (field, message) => errors.push({ row, field, message });
    const dept = deptLookup.get(deptText.toLowerCase());
    const semesters = /^\d+$/.test(semText) ? Number(semText) : NaN;
    const semOk = semesters >= 1 && semesters <= 20;
    if (!dept) err('department', `Unknown department "${deptText}"`);
    if (!code || code.length > 30) err('code', 'Code is required (max 30 characters)');
    if (!name || name.length > 200) err('name', 'Name is required (max 200 characters)');
    if (!semOk) err('total_semesters', 'Total Semesters must be a whole number between 1 and 20');
    if (!dept || !code || code.length > 30 || !name || name.length > 200 || !semOk) continue;
    const key = code.toLowerCase();
    if (seen.has(key)) { err('code', 'Duplicate code within this file'); continue; }
    seen.add(key);
    if (codes.has(key)) { skipped += 1; continue; }
    const dn = `${dept.id}|${name.toLowerCase()}`;
    if (deptNames.has(dn)) { err('name', `Program "${name}" already exists in ${dept.name}`); continue; }
    deptNames.add(dn);
    toInsert.push({ department_id: dept.id, code, name, total_semesters: semesters });
  }
  if (errors.length) throw httpError(422, 'UPLOAD_INVALID', `${errors.length} row(s) failed validation`, { rows: errors });
  if (dryRun) return { valid: toInsert.length, skipped, inserted: 0 };
  await withTransaction(async (conn) => {
    for (const p of toInsert) {
      await conn.execute(
        'INSERT INTO programs (department_id, code, name, total_semesters) VALUES (:department_id, :code, :name, :total_semesters)', p,
      );
    }
  });
  return { valid: toInsert.length, skipped, inserted: toInsert.length };
}
