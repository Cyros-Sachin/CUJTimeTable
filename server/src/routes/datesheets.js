import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db.js';
import { validateQuery } from '../middleware/validate.js';
import { httpError } from '../utils/httpError.js';
import { getOrCreateRef } from '../services/refService.js';
import { renderDatesheetPdf } from '../services/pdfService.js';
import { writeAudit } from '../services/auditService.js';

export const datesheetsRouter = Router();

const listQuerySchema = z.object({
  cycle_id: z.coerce.number().int().positive(),
  exam_type: z.enum(['REGULAR', 'REAPPEAR']),
  department_id: z.coerce.number().int().positive().optional(),
});

datesheetsRouter.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const deptScope = req.user.role === 'DEPT_COORDINATOR' ? req.user.departmentId : req.query.department_id;
    const where = ['e.exam_cycle_id = :cycleId', 'e.exam_type = :examType'];
    const params = { cycleId: req.query.cycle_id, examType: req.query.exam_type };
    if (deptScope) { where.push('e.department_id = :deptId'); params.deptId = deptScope; }

    const [rows] = await pool.query(`
      SELECT e.department_id, d.name AS department_name, d.code AS department_code,
             e.program_id, p.name AS program_name, p.code AS program_code, p.total_semesters,
             e.semester, COUNT(*) AS course_count, MIN(e.exam_date) AS first_date, MAX(e.exam_date) AS last_date,
             MAX(e.updated_at) AS last_updated, r.ref_no, r.issued_on
      FROM exam_entries e
      JOIN departments d ON d.id = e.department_id
      JOIN programs p ON p.id = e.program_id
      LEFT JOIN datesheet_refs r ON r.exam_cycle_id = e.exam_cycle_id AND r.program_id = e.program_id
        AND r.semester = e.semester AND r.exam_type = e.exam_type
      WHERE ${where.join(' AND ')}
      GROUP BY e.department_id, d.name, d.code, e.program_id, p.name, p.code, p.total_semesters, e.semester, r.ref_no, r.issued_on
      ORDER BY d.name, p.name, e.semester
    `, params);

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

const pdfQuerySchema = z.object({
  cycle_id: z.coerce.number().int().positive(),
  program_id: z.coerce.number().int().positive(),
  semester: z.coerce.number().int().positive(),
  exam_type: z.enum(['REGULAR', 'REAPPEAR']),
  download: z.coerce.number().optional(),
});

datesheetsRouter.get('/pdf', validateQuery(pdfQuerySchema), async (req, res, next) => {
  try {
    const { cycle_id: cycleId, program_id: programId, semester, exam_type: examType, download } = req.query;

    const [programRows] = await pool.query(
      `SELECT p.id, p.name, p.code, p.department_id, d.name AS department_name, d.code AS department_code
       FROM programs p JOIN departments d ON d.id = p.department_id WHERE p.id = :id LIMIT 1`,
      { id: programId },
    );
    const program = programRows[0];
    if (!program) throw httpError(404, 'NOT_FOUND', 'Program not found');
    if (req.user.role === 'DEPT_COORDINATOR' && program.department_id !== req.user.departmentId) {
      throw httpError(404, 'NOT_FOUND', 'Program not found');
    }

    const [cycleRows] = await pool.query('SELECT id, title, month_year FROM exam_cycles WHERE id = :id', { id: cycleId });
    const cycle = cycleRows[0];
    if (!cycle) throw httpError(404, 'NOT_FOUND', 'Exam cycle not found');

    const [entryRows] = await pool.query(
      `SELECT e.exam_date, e.course_code, e.course_name, ts.label AS time_slot_label, ts.start_time
       FROM exam_entries e JOIN time_slots ts ON ts.id = e.time_slot_id
       WHERE e.exam_cycle_id = :cycle AND e.program_id = :prog AND e.semester = :sem AND e.exam_type = :type
       ORDER BY e.exam_date ASC, ts.start_time ASC`,
      { cycle: cycleId, prog: programId, sem: semester, type: examType },
    );
    if (!entryRows.length) throw httpError(404, 'NOT_FOUND', 'No entries found for this program/semester/type yet');

    const { refNo, issuedOn } = await withTransaction((conn) => getOrCreateRef(conn, { cycleId, programId, semester, examType }));

    const pdfBuffer = await renderDatesheetPdf({
      refNo, issuedOn, cycleTitle: cycle.title, cycleMonthYear: cycle.month_year,
      departmentName: program.department_name, programName: program.name, semester, examType, rows: entryRows,
    });

    await writeAudit({
      userId: req.user.id, action: 'PDF_EXPORT', entity: 'datesheet', entityId: `${programId}-${semester}-${examType}`,
      details: { refNo, cycleId }, ip: req.ip,
    });

    const examLabel = examType === 'REAPPEAR' ? 'Reappear' : 'Regular';
    const filename = `Datesheet_${program.department_code}_${program.code}_Sem${semester}_${examLabel}_${cycle.month_year.replace(/[,\s]+/g, '-')}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${download ? 'attachment' : 'inline'}; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(Buffer.from(pdfBuffer));
  } catch (err) {
    next(err);
  }
});
