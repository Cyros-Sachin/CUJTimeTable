import { ZodError } from 'zod';
import { httpError } from '../utils/httpError.js';

function zodToFields(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export function validateBody(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(httpError(422, 'VALIDATION', 'Validation failed', zodToFields(err)));
      }
      next(err);
    }
  };
}

export function validateQuery(schema) {
  return (req, res, next) => {
    try {
      req.query = schema.parse(req.query);
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        return next(httpError(422, 'VALIDATION', 'Validation failed', zodToFields(err)));
      }
      next(err);
    }
  };
}
