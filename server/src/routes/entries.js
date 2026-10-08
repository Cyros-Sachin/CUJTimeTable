import { Router } from 'express';
import { z } from 'zod';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { HttpError, httpError } from '../utils/httpError.js';
import {
  createEntry, updateEntry, deleteEntry, checkClash, listEntries, getEntryById,
} from '../services/entryService.js';
import { writeAudit } from '../services/auditService.js';
import { pool } from '../db.js';
import { uploadSingle } from '../middleware/upload.js';
import { buildTemplateWorkbook } from '../services/excelService.js';
import { parseAndValidateUpload, insertUpload } from '../services/uploadService.js';

export const entriesRouter = Router();

const courseCodeRegex = /^[A-Z0-9][A-Z0-9\-_/ ]{2,29}$/;
const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

const entrySchema = z.object({
  exam_cycle_id: z.coerce.number().int().positive(),
  department_id: z.coerce.number().int().positive().optional(),
  program_id: z.coerce.number().int().positive(),
  semester: z.coerce.number().int().min(1).max(20),
  exam_type: z.enum(['REGULAR', 'REAPPEAR']),
  subject_type_id: z.coerce.number().int().positive(),
  time_slot_id: z.coerce.number().int().positive(),
  exam_date: z.string().regex(dateRegex, 'Date must be YYYY-MM-DD'),
  course_code: z.string().trim().toUpperCase().regex(courseCodeRegex, 'Invalid course code format'),
  course_name: z.string().trim().min(2).max(200),
  student_count: z.coerce.number().int().min(1).max(5000),
});

const updateSchema = entrySchema.partial();

const clashCheckSchema = entrySchema.extend({ exclude_id: z.coerce.number().int().positive().optional() });

const listQuerySchema = z.object({
  cycle_id: z.coerce.number().int().positive().optional(),
  exam_type: z.enum(['REGULAR', 'REAPPEAR']).optional(),
  department_id: z.coerce.number().int().positive().optional(),
  program_id: z.coerce.number().int().positive().optional(),
  semester: z.coerce.number().int().optional(),
  date_from: z.string().regex(dateRegex).optional(),
  date_to: z.string().regex(dateRegex).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
});

async function logClashBlock(req, err) {
  if (err instanceof HttpError && (err.code === 'CLASH' || err.code === 'DUPLICATE_COURSE')) {
    await writeAudit({
      userId: req.user.id, action: 'ENTRY_CLASH_BLOCKED', entity: 'exam_entries',
      details: { code: err.code, message: err.message, body: req.body }, ip: req.ip,
    }, pool).catch(() => {});
  }
}

entriesRouter.get('/', validateQuery(listQuerySchema), async (req, res, next) => {
  try {
    const result = await listEntries(req.user, req.query);
    res.json({ data: result.rows, meta: { total: result.total, page: result.page, page_size: result.pageSize } });
  } catch (err) {
    next(err);
  }
});

entriesRouter.post('/check-clash', validateBody(clashCheckSchema), async (req, res, next) => {
  try {
    const result = await checkClash(req.user, req.body);
    res.json({ data: result });
  } catch (err) {
    await logClashBlock(req, err);
    next(err);
  }
});

entriesRouter.post('/', validateBody(entrySchema), async (req, res, next) => {
  try {
    const entry = await createEntry(req.user, req.body, req.ip);
    res.status(201).json({ data: entry });
  } catch (err) {
    await logClashBlock(req, err);
    next(err);
  }
});

entriesRouter.get('/template', async (req, res, next) => {
  try {
    const examType = req.query.exam_type === 'REAPPEAR' ? 'REAPPEAR' : 'REGULAR';
    const workbook = await buildTemplateWorkbook(examType);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Entry_Template_${examType}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    next(err);
  }
});

const bulkUploadBodySchema = z.object({
  exam_cycle_id: z.coerce.number().int().positive(),
  exam_type: z.enum(['REGULAR', 'REAPPEAR']),
  dry_run: z.union([z.literal('true'), z.literal('false')]).default('false'),
  department_id: z.coerce.number().int().positive().optional(),
});

entriesRouter.post('/bulk-upload', (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) return next(httpError(422, 'UPLOAD_INVALID', err.message === 'UNSUPPORTED_FILE_TYPE'
      ? 'Only .xlsx or .csv files are accepted' : 'File upload failed', { rows: [] }));
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) throw httpError(422, 'UPLOAD_INVALID', 'No file uploaded', { rows: [] });
    const body = bulkUploadBodySchema.parse(req.body);
    const departmentId = req.user.role === 'DEPT_COORDINATOR' ? req.user.departmentId : body.department_id;
    if (!departmentId) throw httpError(422, 'VALIDATION', 'department_id is required', { department_id: 'Required' });

    const { rows, errors } = await parseAndValidateUpload({
      file: req.file, examCycleId: body.exam_cycle_id, examType: body.exam_type, departmentId, user: req.user,
    });

    if (errors.length) {
      throw httpError(422, 'UPLOAD_INVALID', `${errors.length} row(s) failed validation`, { rows: errors });
    }

    if (body.dry_run === 'true') {
      return res.json({ data: { valid: rows.length, rows } });
    }

    const insertedIds = await insertUpload({
      rows, examCycleId: body.exam_cycle_id, examType: body.exam_type, departmentId, user: req.user, ip: req.ip,
    });
    res.status(201).json({ data: { inserted: insertedIds.length } });
  } catch (err) {
    await logClashBlock(req, err);
    next(err);
  }
});

entriesRouter.put('/:id', validateBody(updateSchema), async (req, res, next) => {
  try {
    const entry = await updateEntry(req.user, Number(req.params.id), req.body, req.ip);
    res.json({ data: entry });
  } catch (err) {
    await logClashBlock(req, err);
    next(err);
  }
});

entriesRouter.delete('/:id', async (req, res, next) => {
  try {
    await deleteEntry(req.user, Number(req.params.id), req.ip);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

entriesRouter.get('/:id', async (req, res, next) => {
  try {
    const entry = await getEntryById(req.user, Number(req.params.id));
    res.json({ data: entry });
  } catch (err) {
    next(err);
  }
});
