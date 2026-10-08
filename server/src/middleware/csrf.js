import { httpError } from '../utils/httpError.js';

const UNSAFE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function csrf(req, res, next) {
  if (!UNSAFE_METHODS.has(req.method)) return next();
  if (req.headers['x-requested-with'] !== 'cuj-web') {
    return next(httpError(403, 'CSRF', 'Missing or invalid X-Requested-With header'));
  }
  next();
}
