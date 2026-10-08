import { Router } from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { pool } from '../db.js';
import { config } from '../config.js';
import { requireRole } from '../middleware/rbac.js';
import { validateBody, validateQuery } from '../middleware/validate.js';
import { httpError } from '../utils/httpError.js';
import { writeAudit } from '../services/auditService.js';
import { uploadImage } from '../middleware/upload.js';

export const adminRouter = Router();
adminRouter.use(requireRole('EXAM_CELL'));

async function audit(req, action, entity, entityId, details) {
  await writeAudit({ userId: req.user.id, action, entity, entityId, details, ip: req.ip });
}

// ---- Departments ----------------------------------------------------------
const departmentSchema = z.object({
  code: z.string().trim().min(1).max(20),
  name: z.string().trim().min(1).max(200),
  is_active: z.coerce.boolean().optional(),
});

adminRouter.get('/departments', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM departments ORDER BY name');
    res.json({ data: rows });
  } catch (err) { next(err); }
});

adminRouter.post('/departments', validateBody(departmentSchema), async (req, res, next) => {
  try {
    const [result] = await pool.execute('INSERT INTO departments (code, name) VALUES (:code, :name)', req.body);
    await audit(req, 'ADMIN_CREATE', 'departments', result.insertId, req.body);
    res.status(201).json({ data: { id: result.insertId, ...req.body } });
  } catch (err) { next(err); }
});

adminRouter.put('/departments/:id', validateBody(departmentSchema.partial()), async (req, res, next) => {
  try {
    const fields = Object.keys(req.body);
    if (!fields.length) throw httpError(400, 'BAD_REQUEST', 'No fields to update');
    const sets = fields.map((f) => `${f} = :${f}`).join(', ');
    await pool.execute(`UPDATE departments SET ${sets} WHERE id = :id`, { ...req.body, id: req.params.id });
    await audit(req, 'ADMIN_UPDATE', 'departments', req.params.id, req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

adminRouter.delete('/departments/:id', async (req, res, next) => {
  try {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM programs WHERE department_id = :id', { id: req.params.id });
    if (Number(count) > 0) {
      await pool.execute('UPDATE departments SET is_active = 0 WHERE id = :id', { id: req.params.id });
    } else {
      await pool.execute('DELETE FROM departments WHERE id = :id', { id: req.params.id });
    }
    await audit(req, 'ADMIN_DELETE', 'departments', req.params.id);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ---- Programs ---------------------------------------------------------
const programSchema = z.object({
  department_id: z.coerce.number().int().positive(),
  code: z.string().trim().min(1).max(30),
  name: z.string().trim().min(1).max(200),
  total_semesters: z.coerce.number().int().min(1).max(20),
  is_active: z.coerce.boolean().optional(),
});

adminRouter.get('/programs', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, d.name AS department_name FROM programs p JOIN departments d ON d.id = p.department_id ORDER BY d.name, p.name
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

adminRouter.post('/programs', validateBody(programSchema), async (req, res, next) => {
  try {
    const [result] = await pool.execute(
      'INSERT INTO programs (department_id, code, name, total_semesters) VALUES (:department_id, :code, :name, :total_semesters)',
      req.body,
    );
    await audit(req, 'ADMIN_CREATE', 'programs', result.insertId, req.body);
    res.status(201).json({ data: { id: result.insertId, ...req.body } });
  } catch (err) { next(err); }
});

adminRouter.put('/programs/:id', validateBody(programSchema.partial()), async (req, res, next) => {
  try {
    const fields = Object.keys(req.body);
    if (!fields.length) throw httpError(400, 'BAD_REQUEST', 'No fields to update');
    const sets = fields.map((f) => `${f} = :${f}`).join(', ');
    await pool.execute(`UPDATE programs SET ${sets} WHERE id = :id`, { ...req.body, id: req.params.id });
    await audit(req, 'ADMIN_UPDATE', 'programs', req.params.id, req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

adminRouter.delete('/programs/:id', async (req, res, next) => {
  try {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM exam_entries WHERE program_id = :id', { id: req.params.id });
    if (Number(count) > 0) {
      await pool.execute('UPDATE programs SET is_active = 0 WHERE id = :id', { id: req.params.id });
    } else {
      await pool.execute('DELETE FROM programs WHERE id = :id', { id: req.params.id });
    }
    await audit(req, 'ADMIN_DELETE', 'programs', req.params.id);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ---- Subject types ------------------------------------------------------
const subjectTypeSchema = z.object({ name: z.string().trim().min(1).max(100), is_active: z.coerce.boolean().optional() });

adminRouter.get('/subject-types', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM subject_types ORDER BY id');
    res.json({ data: rows });
  } catch (err) { next(err); }
});
adminRouter.post('/subject-types', validateBody(subjectTypeSchema), async (req, res, next) => {
  try {
    const [result] = await pool.execute('INSERT INTO subject_types (name) VALUES (:name)', req.body);
    await audit(req, 'ADMIN_CREATE', 'subject_types', result.insertId, req.body);
    res.status(201).json({ data: { id: result.insertId, ...req.body } });
  } catch (err) { next(err); }
});
adminRouter.put('/subject-types/:id', validateBody(subjectTypeSchema.partial()), async (req, res, next) => {
  try {
    const fields = Object.keys(req.body);
    if (!fields.length) throw httpError(400, 'BAD_REQUEST', 'No fields to update');
    const sets = fields.map((f) => `${f} = :${f}`).join(', ');
    await pool.execute(`UPDATE subject_types SET ${sets} WHERE id = :id`, { ...req.body, id: req.params.id });
    await audit(req, 'ADMIN_UPDATE', 'subject_types', req.params.id, req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
adminRouter.delete('/subject-types/:id', async (req, res, next) => {
  try {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM exam_entries WHERE subject_type_id = :id', { id: req.params.id });
    if (Number(count) > 0) await pool.execute('UPDATE subject_types SET is_active = 0 WHERE id = :id', { id: req.params.id });
    else await pool.execute('DELETE FROM subject_types WHERE id = :id', { id: req.params.id });
    await audit(req, 'ADMIN_DELETE', 'subject_types', req.params.id);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ---- Time slots ----------------------------------------------------------
const timeSlotSchema = z.object({
  label: z.string().trim().min(1).max(30),
  start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
  is_active: z.coerce.boolean().optional(),
});

adminRouter.get('/time-slots', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM time_slots ORDER BY start_time');
    res.json({ data: rows });
  } catch (err) { next(err); }
});
adminRouter.post('/time-slots', validateBody(timeSlotSchema), async (req, res, next) => {
  try {
    const [result] = await pool.execute(
      'INSERT INTO time_slots (label, start_time, end_time) VALUES (:label, :start_time, :end_time)', req.body,
    );
    await audit(req, 'ADMIN_CREATE', 'time_slots', result.insertId, req.body);
    res.status(201).json({ data: { id: result.insertId, ...req.body } });
  } catch (err) { next(err); }
});
adminRouter.put('/time-slots/:id', validateBody(timeSlotSchema.partial()), async (req, res, next) => {
  try {
    const fields = Object.keys(req.body);
    if (!fields.length) throw httpError(400, 'BAD_REQUEST', 'No fields to update');
    const sets = fields.map((f) => `${f} = :${f}`).join(', ');
    await pool.execute(`UPDATE time_slots SET ${sets} WHERE id = :id`, { ...req.body, id: req.params.id });
    await audit(req, 'ADMIN_UPDATE', 'time_slots', req.params.id, req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
adminRouter.delete('/time-slots/:id', async (req, res, next) => {
  try {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM exam_entries WHERE time_slot_id = :id', { id: req.params.id });
    if (Number(count) > 0) await pool.execute('UPDATE time_slots SET is_active = 0 WHERE id = :id', { id: req.params.id });
    else await pool.execute('DELETE FROM time_slots WHERE id = :id', { id: req.params.id });
    await audit(req, 'ADMIN_DELETE', 'time_slots', req.params.id);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ---- Academic sessions -----------------------------------------------
const sessionSchema = z.object({ label: z.string().trim().min(1).max(20), is_current: z.coerce.boolean().optional() });

adminRouter.get('/sessions', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM academic_sessions ORDER BY label DESC');
    res.json({ data: rows });
  } catch (err) { next(err); }
});
adminRouter.post('/sessions', validateBody(sessionSchema), async (req, res, next) => {
  try {
    if (req.body.is_current) await pool.execute('UPDATE academic_sessions SET is_current = 0');
    const [result] = await pool.execute(
      'INSERT INTO academic_sessions (label, is_current) VALUES (:label, :is_current)',
      { label: req.body.label, is_current: req.body.is_current ? 1 : 0 },
    );
    await audit(req, 'ADMIN_CREATE', 'academic_sessions', result.insertId, req.body);
    res.status(201).json({ data: { id: result.insertId, ...req.body } });
  } catch (err) { next(err); }
});
adminRouter.put('/sessions/:id', validateBody(sessionSchema.partial()), async (req, res, next) => {
  try {
    if (req.body.is_current) await pool.execute('UPDATE academic_sessions SET is_current = 0');
    const fields = Object.keys(req.body);
    if (!fields.length) throw httpError(400, 'BAD_REQUEST', 'No fields to update');
    const sets = fields.map((f) => `${f} = :${f}`).join(', ');
    await pool.execute(`UPDATE academic_sessions SET ${sets} WHERE id = :id`, { ...req.body, id: req.params.id });
    await audit(req, 'ADMIN_UPDATE', 'academic_sessions', req.params.id, req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
adminRouter.delete('/sessions/:id', async (req, res, next) => {
  try {
    const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM exam_cycles WHERE academic_session_id = :id', { id: req.params.id });
    if (Number(count) > 0) throw httpError(409, 'IN_USE', 'Session has exam cycles; cannot delete');
    await pool.execute('DELETE FROM academic_sessions WHERE id = :id', { id: req.params.id });
    await audit(req, 'ADMIN_DELETE', 'academic_sessions', req.params.id);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ---- Exam cycles -----------------------------------------------------
const cycleSchema = z.object({
  academic_session_id: z.coerce.number().int().positive(),
  title: z.string().trim().min(1).max(150),
  month_year: z.string().trim().min(1).max(30),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
const cycleStatusSchema = z.object({ status: z.enum(['OPEN', 'LOCKED']) });

adminRouter.get('/cycles', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.*, s.label AS session_label FROM exam_cycles c
      JOIN academic_sessions s ON s.id = c.academic_session_id ORDER BY c.start_date DESC
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});
adminRouter.post('/cycles', validateBody(cycleSchema), async (req, res, next) => {
  try {
    if (req.body.end_date < req.body.start_date) throw httpError(422, 'VALIDATION', 'end_date must be on or after start_date', { end_date: 'Must be after start date' });
    const [result] = await pool.execute(
      `INSERT INTO exam_cycles (academic_session_id, title, month_year, start_date, end_date)
       VALUES (:academic_session_id, :title, :month_year, :start_date, :end_date)`,
      req.body,
    );
    await audit(req, 'ADMIN_CREATE', 'exam_cycles', result.insertId, req.body);
    res.status(201).json({ data: { id: result.insertId, ...req.body, status: 'OPEN' } });
  } catch (err) { next(err); }
});
adminRouter.put('/cycles/:id', validateBody(cycleSchema.partial()), async (req, res, next) => {
  try {
    const fields = Object.keys(req.body);
    if (!fields.length) throw httpError(400, 'BAD_REQUEST', 'No fields to update');
    const sets = fields.map((f) => `${f} = :${f}`).join(', ');
    await pool.execute(`UPDATE exam_cycles SET ${sets} WHERE id = :id`, { ...req.body, id: req.params.id });
    await audit(req, 'ADMIN_UPDATE', 'exam_cycles', req.params.id, req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});
adminRouter.patch('/cycles/:id/status', validateBody(cycleStatusSchema), async (req, res, next) => {
  try {
    await pool.execute('UPDATE exam_cycles SET status = :status WHERE id = :id', { status: req.body.status, id: req.params.id });
    await audit(req, 'ADMIN_CYCLE_STATUS', 'exam_cycles', req.params.id, req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ---- Users -------------------------------------------------------------
const createUserSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(160),
  department_id: z.coerce.number().int().positive(),
  password: z.string().min(10).regex(/[A-Za-z]/).regex(/[0-9]/).optional(),
});
const updateUserSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  is_active: z.coerce.boolean().optional(),
});

function randomPassword() {
  return `Cuj#${crypto.randomBytes(6).toString('hex')}9`;
}

adminRouter.get('/users', async (req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.email, u.role, u.department_id, d.name AS department_name,
             u.is_active, u.must_change_password, u.last_login_at, u.created_at
      FROM users u LEFT JOIN departments d ON d.id = u.department_id ORDER BY u.role, u.name
    `);
    res.json({ data: rows });
  } catch (err) { next(err); }
});

adminRouter.post('/users', validateBody(createUserSchema), async (req, res, next) => {
  try {
    const tempPassword = req.body.password || randomPassword();
    const hash = await bcrypt.hash(tempPassword, 11);
    const [result] = await pool.execute(
      `INSERT INTO users (name, email, password_hash, role, department_id, must_change_password)
       VALUES (:name, :email, :hash, 'DEPT_COORDINATOR', :department_id, 1)`,
      { name: req.body.name, email: req.body.email, hash, department_id: req.body.department_id },
    );
    await audit(req, 'ADMIN_CREATE', 'users', result.insertId, { name: req.body.name, email: req.body.email });
    res.status(201).json({ data: { id: result.insertId, name: req.body.name, email: req.body.email, temp_password: tempPassword } });
  } catch (err) { next(err); }
});

adminRouter.put('/users/:id', validateBody(updateUserSchema), async (req, res, next) => {
  try {
    const fields = Object.keys(req.body);
    if (!fields.length) throw httpError(400, 'BAD_REQUEST', 'No fields to update');
    const sets = fields.map((f) => `${f} = :${f}`).join(', ');
    await pool.execute(`UPDATE users SET ${sets} WHERE id = :id AND role = 'DEPT_COORDINATOR'`, { ...req.body, id: req.params.id });
    await audit(req, 'ADMIN_UPDATE', 'users', req.params.id, req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

adminRouter.post('/users/:id/reset-password', async (req, res, next) => {
  try {
    const tempPassword = randomPassword();
    const hash = await bcrypt.hash(tempPassword, 11);
    await pool.execute('UPDATE users SET password_hash = :hash, must_change_password = 1 WHERE id = :id', { hash, id: req.params.id });
    await audit(req, 'ADMIN_RESET_PASSWORD', 'users', req.params.id);
    res.json({ data: { temp_password: tempPassword } });
  } catch (err) { next(err); }
});

// ---- Branding ------------------------------------------------------------
const brandingSchema = z.object({
  controller_name: z.string().trim().max(120).optional(),
  controller_title: z.string().trim().max(120).optional(),
});

adminRouter.get('/branding', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT k, v FROM settings');
    res.json({ data: Object.fromEntries(rows.map((r) => [r.k, r.v])) });
  } catch (err) { next(err); }
});

adminRouter.put('/branding', validateBody(brandingSchema), async (req, res, next) => {
  try {
    for (const [k, v] of Object.entries(req.body)) {
      await pool.execute('INSERT INTO settings (k, v) VALUES (:k, :v) ON DUPLICATE KEY UPDATE v = VALUES(v)', { k, v });
    }
    await audit(req, 'ADMIN_UPDATE', 'settings', 'branding', req.body);
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

adminRouter.post('/branding/logo', (req, res, next) => {
  uploadImage.single('file')(req, res, (err) => (err ? next(httpError(422, 'UPLOAD_INVALID', 'Logo must be a PNG/JPG under 1MB')) : next()));
}, async (req, res, next) => {
  try {
    if (!req.file) throw httpError(422, 'UPLOAD_INVALID', 'No file uploaded');
    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const relPath = path.join('branding', `logo.${ext}`);
    await fs.mkdir(path.join(config.storageDir, 'branding'), { recursive: true });
    await fs.writeFile(path.join(config.storageDir, relPath), req.file.buffer);
    await pool.execute("INSERT INTO settings (k, v) VALUES ('logo_path', :v) ON DUPLICATE KEY UPDATE v = VALUES(v)", { v: relPath });
    await audit(req, 'ADMIN_UPLOAD_LOGO', 'settings', 'logo_path');
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

adminRouter.post('/branding/signature', (req, res, next) => {
  uploadImage.single('file')(req, res, (err) => (err ? next(httpError(422, 'UPLOAD_INVALID', 'Signature must be a PNG/JPG under 1MB')) : next()));
}, async (req, res, next) => {
  try {
    if (!req.file) throw httpError(422, 'UPLOAD_INVALID', 'No file uploaded');
    const ext = req.file.mimetype === 'image/png' ? 'png' : 'jpg';
    const relPath = path.join('branding', `signature.${ext}`);
    await fs.mkdir(path.join(config.storageDir, 'branding'), { recursive: true });
    await fs.writeFile(path.join(config.storageDir, relPath), req.file.buffer);
    await pool.execute("INSERT INTO settings (k, v) VALUES ('signature_path', :v) ON DUPLICATE KEY UPDATE v = VALUES(v)", { v: relPath });
    await audit(req, 'ADMIN_UPLOAD_SIGNATURE', 'settings', 'signature_path');
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

// ---- Audit log -------------------------------------------------------
const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(50),
});

adminRouter.get('/audit-logs', validateQuery(auditQuerySchema), async (req, res, next) => {
  try {
    const offset = (req.query.page - 1) * req.query.page_size;
    const [rows] = await pool.query(
      `SELECT a.*, u.name AS user_name, u.email AS user_email FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id ORDER BY a.created_at DESC LIMIT :limit OFFSET :offset`,
      { limit: req.query.page_size, offset },
    );
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM audit_logs');
    res.json({ data: rows, meta: { total: Number(total), page: req.query.page, page_size: req.query.page_size } });
  } catch (err) { next(err); }
});
