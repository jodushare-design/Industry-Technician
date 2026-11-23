/**
 * One error shape for every app. Data-layer errors (Supabase/PostgREST/Auth)
 * are mapped to an AppError with a stable `code` and a safe user message.
 * Raw database messages are kept in `cause` for logging only — never shown.
 */

export const ERROR_CODES = [
  'validation',
  'unauthenticated',
  'forbidden',
  'not_found',
  'conflict',
  'rate_limited',
  'business_rule',
  'network',
  'unknown',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const USER_MESSAGES: Record<ErrorCode, string> = {
  validation: 'Please check the highlighted fields.',
  unauthenticated: 'Please sign in to continue.',
  forbidden: "You don't have permission to do that.",
  not_found: "We couldn't find that.",
  conflict: 'That already exists or was changed by someone else. Please refresh.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  business_rule: "That action isn't allowed at this stage.",
  network: 'No connection. Check your internet and try again.',
  unknown: 'Something went wrong. Please try again.',
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly userMessage: string;
  readonly fieldErrors?: Record<string, string[]>;
  override readonly cause?: unknown;

  constructor(
    code: ErrorCode,
    opts: { message?: string; userMessage?: string; fieldErrors?: Record<string, string[]>; cause?: unknown } = {},
  ) {
    super(opts.message ?? code);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = opts.userMessage ?? USER_MESSAGES[code];
    this.fieldErrors = opts.fieldErrors;
    this.cause = opts.cause;
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/**
 * Business-rule violations raised from Postgres functions use
 * `raise exception 'ITM:<rule_code>: <message>'` with SQLSTATE P0001.
 */
const BUSINESS_RULE_PREFIX = /^ITM:([a-z0-9_]+):\s*(.*)$/s;

type PgLikeError = { code?: string; message?: string; status?: number; name?: string; details?: string };

/** Map any thrown value (PostgREST error, Auth error, fetch failure, AppError) to an AppError. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  if (e === null || e === undefined) return new AppError('unknown');

  const err = (typeof e === 'object' ? e : { message: String(e) }) as PgLikeError;
  const message = err.message ?? '';

  // Network failures (fetch TypeError, offline)
  if (err.name === 'TypeError' && /fetch|network/i.test(message)) {
    return new AppError('network', { message, cause: e });
  }

  // Business rule raised from SQL
  const rule = BUSINESS_RULE_PREFIX.exec(message);
  if (err.code === 'P0001' && rule) {
    if (rule[1] === 'rate_limited') return new AppError('rate_limited', { message, userMessage: rule[2] || undefined, cause: e });
    return new AppError('business_rule', { message: `${rule[1]}: ${rule[2]}`, userMessage: rule[2] || undefined, cause: e });
  }

  switch (err.code) {
    case '42501': // insufficient_privilege (RLS)
      return new AppError('forbidden', { message, cause: e });
    case '23505': // unique_violation
    case '40001': // serialization_failure
      return new AppError('conflict', { message, cause: e });
    case '23502': // not_null_violation
    case '23514': // check_violation
    case '22P02': // invalid_text_representation
    case '23503': // foreign_key_violation
      return new AppError('validation', { message, cause: e });
    case 'PGRST116': // no rows for .single()
      return new AppError('not_found', { message, cause: e });
    case 'P0001':
      return new AppError('business_rule', { message, cause: e });
  }

  if (err.status === 401) return new AppError('unauthenticated', { message, cause: e });
  if (err.status === 403) return new AppError('forbidden', { message, cause: e });
  if (err.status === 404) return new AppError('not_found', { message, cause: e });
  if (err.status === 429 || /rate limit/i.test(message)) return new AppError('rate_limited', { message, cause: e });

  return new AppError('unknown', { message, cause: e });
}
