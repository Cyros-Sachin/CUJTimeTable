import { HttpError } from '../utils/httpError.js';
import { logger } from '../logger.js';

export function notFoundApi(req, res) {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
}

export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
    });
  }

  if (err?.code === 'ER_DUP_ENTRY') {
    const msg = String(err.sqlMessage || '');
    const code = msg.includes('uq_course') ? 'DUPLICATE_COURSE' : msg.includes('uq_slot') ? 'CLASH' : 'DUPLICATE';
    return res.status(409).json({ error: { code, message: 'This entry conflicts with an existing record.' } });
  }

  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'Request body too large' } });
  }

  if (err?.message === 'CSRF' || err?.status === 403) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: err.message || 'Forbidden' } });
  }

  logger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong. Please try again.' } });
}
