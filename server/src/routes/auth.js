import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { pool } from '../db.js';
import { config } from '../config.js';
import { httpError } from '../utils/httpError.js';
import { validateBody } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/limits.js';
import { getJwtSecret } from '../services/seedService.js';
import { writeAudit } from '../services/auditService.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function userView(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    department: user.department_id
      ? { id: user.department_id, name: user.department_name, code: user.department_code }
      : null,
    must_change_password: !!user.must_change_password,
  };
}

function setSessionCookie(res, userId) {
  return getJwtSecret().then((secret) => {
    const token = jwt.sign({ sub: userId }, secret, { expiresIn: '8h' });
    res.cookie('cuj_token', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.cookieSecure,
      maxAge: 8 * 60 * 60 * 1000,
    });
  });
}

authRouter.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const [rows] = await pool.execute(
      `SELECT u.*, d.name AS department_name, d.code AS department_code
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.email = :email LIMIT 1`,
      { email },
    );
    const user = rows[0];
    if (!user || !user.is_active) throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');

    await setSessionCookie(res, user.id);
    await pool.execute('UPDATE users SET last_login_at = NOW() WHERE id = :id', { id: user.id });
    await writeAudit({ userId: user.id, action: 'LOGIN', entity: 'users', entityId: user.id, ip: req.ip });

    res.json({ data: userView(user) });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    if (req.user) await writeAudit({ userId: req.user.id, action: 'LOGOUT', entity: 'users', entityId: req.user.id, ip: req.ip });
    res.clearCookie('cuj_token');
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', async (req, res, next) => {
  try {
    if (!req.user) throw httpError(401, 'UNAUTHENTICATED', 'Not logged in');
    res.json({
      data: {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role,
        department: req.user.departmentId
          ? { id: req.user.departmentId, name: req.user.departmentName, code: req.user.departmentCode }
          : null,
        must_change_password: req.user.mustChangePassword,
      },
    });
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(10).regex(/[A-Za-z]/).regex(/[0-9]/),
});

authRouter.post('/change-password', validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    if (!req.user) throw httpError(401, 'UNAUTHENTICATED', 'Not logged in');
    const [rows] = await pool.execute('SELECT password_hash FROM users WHERE id = :id', { id: req.user.id });
    const ok = await bcrypt.compare(req.body.current_password, rows[0].password_hash);
    if (!ok) throw httpError(422, 'VALIDATION', 'Current password is incorrect', { current_password: 'Incorrect password' });

    const hash = await bcrypt.hash(req.body.new_password, 11);
    await pool.execute(
      'UPDATE users SET password_hash = :hash, must_change_password = 0 WHERE id = :id',
      { hash, id: req.user.id },
    );
    await writeAudit({ userId: req.user.id, action: 'PASSWORD_CHANGE', entity: 'users', entityId: req.user.id, ip: req.ip });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});
