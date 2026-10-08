import { httpError } from '../utils/httpError.js';

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return next(httpError(401, 'UNAUTHENTICATED', 'Not logged in'));
    if (req.user.role !== role) return next(httpError(403, 'FORBIDDEN', 'Not allowed for this role'));
    next();
  };
}

// For coordinators, the department scope is always their own account's department,
// regardless of anything the client sent. For the exam cell, an explicit
// department_id (body or query) selects the department; omitted means "all".
export function scopeDepartment(req) {
  if (req.user.role === 'DEPT_COORDINATOR') return req.user.departmentId;
  const raw = req.body?.department_id ?? req.query?.department_id;
  if (raw === undefined || raw === null || raw === '') return undefined;
  const id = Number(raw);
  return Number.isFinite(id) ? id : undefined;
}
