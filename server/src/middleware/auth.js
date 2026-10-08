import jwt from 'jsonwebtoken';
import { pool } from '../db.js';
import { httpError } from '../utils/httpError.js';
import { getJwtSecret } from '../services/seedService.js';

const PUBLIC_PATHS = new Set(['/auth/login', '/auth/logout', '/health']);

export async function auth(req, res, next) {
  try {
    if (PUBLIC_PATHS.has(req.path)) return next();

    const token = req.cookies?.cuj_token;
    if (!token) throw httpError(401, 'UNAUTHENTICATED', 'Not logged in');

    let payload;
    try {
      payload = jwt.verify(token, await getJwtSecret());
    } catch {
      throw httpError(401, 'UNAUTHENTICATED', 'Session expired or invalid');
    }

    const [rows] = await pool.execute(
      `SELECT u.id, u.name, u.email, u.role, u.department_id, u.is_active, u.must_change_password,
              d.name AS department_name, d.code AS department_code
       FROM users u LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.id = :id LIMIT 1`,
      { id: payload.sub },
    );
    const user = rows[0];
    if (!user || !user.is_active) {
      throw httpError(401, 'UNAUTHENTICATED', 'Account unavailable');
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      departmentId: user.department_id,
      departmentName: user.department_name,
      departmentCode: user.department_code,
      mustChangePassword: !!user.must_change_password,
    };

    if (req.user.mustChangePassword && !req.path.startsWith('/auth/')) {
      throw httpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Password change required before continuing');
    }

    next();
  } catch (err) {
    next(err);
  }
}
