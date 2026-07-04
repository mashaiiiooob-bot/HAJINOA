import { errors } from '../utils/AppError.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates req.body (or req.query) against a Zod schema.
 * Strips unknown keys and replaces req[target] with the parsed, typed value —
 * controllers should never read raw, unvalidated client input.
 */
export function validate(schema, target = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ');
      return next(errors.validation(detail));
    }
    req[target] = result.data;
    next();
  };
}

/**
 * Guards a route param that's expected to be a UUID (e.g. :id) so a malformed
 * value fails fast with a clean 400 instead of reaching Postgres as an
 * `invalid input syntax for type uuid` error and surfacing as a 500.
 */
export function validateUuidParam(paramName) {
  return (req, res, next) => {
    if (!UUID_RE.test(req.params[paramName] || '')) {
      return next(errors.validation(`${paramName} باید یک شناسه معتبر باشد`));
    }
    next();
  };
}
