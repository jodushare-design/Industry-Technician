/**
 * Minimal error-reporting seam. Apps register a sink at startup (e.g. Sentry
 * once a DSN exists); until then errors go to the console.
 *
 * Never pass personal data (phone numbers, names, message text) in `context`.
 */
import { toAppError } from './errors';

export type ErrorContext = Record<string, string | number | boolean | null | undefined>;
export type ErrorSink = (error: Error, context: ErrorContext) => void;

let sink: ErrorSink = (error, context) => {
  // eslint-disable-next-line no-console
  console.error(`[itm] ${error.name}: ${error.message}`, context, error.cause ?? '');
};

export function setErrorSink(next: ErrorSink): void {
  sink = next;
}

/** Report an unexpected error. Expected outcomes (validation, forbidden) are not reported. */
export function reportError(e: unknown, context: ErrorContext = {}): void {
  const appError = toAppError(e);
  if (['validation', 'unauthenticated', 'forbidden', 'not_found', 'rate_limited'].includes(appError.code)) return;
  try {
    sink(appError, { code: appError.code, ...context });
  } catch {
    // never let reporting crash the app
  }
}

const PHONE_RE = /(?<!\d)(?:\+?91)?[6-9]\d{9}(?!\d)/g;
/** Strip Indian mobile numbers from free text before it reaches logs. */
export function redact(text: string): string {
  return text.replace(PHONE_RE, '[phone]');
}
