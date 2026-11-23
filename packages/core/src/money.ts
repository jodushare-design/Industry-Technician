/**
 * INR amounts. The database stores numeric(12,2); PostgREST returns them as
 * strings or numbers. In TypeScript we work in integer paise (bigint) so no
 * floating-point rounding ever touches money.
 */

export type Paise = bigint;

const AMOUNT_RE = /^(\d{1,10})(?:\.(\d{1,2}))?$/;

/** "1234.5" | 1234.5 → 123450n. Rejects negatives, >2 decimals, and values beyond numeric(12,2). */
export function toPaise(value: string | number): Paise {
  const s = typeof value === 'number' ? value.toFixed(2) : value.trim().replace(/,/g, '');
  const m = AMOUNT_RE.exec(s);
  if (!m) throw new RangeError(`Invalid INR amount: ${String(value)}`);
  const rupees = BigInt(m[1]!);
  const paise = BigInt((m[2] ?? '').padEnd(2, '0') || '0');
  return rupees * 100n + paise;
}

/** 123450n → "1234.50" (database form). */
export function toDecimalString(paise: Paise): string {
  if (paise < 0n) throw new RangeError('Negative amounts are not allowed');
  const rupees = paise / 100n;
  const rest = (paise % 100n).toString().padStart(2, '0');
  return `${rupees}.${rest}`;
}

/** 123450n → "₹1,234.50" using Indian digit grouping. */
export function formatInr(paise: Paise): string {
  const [rupees, rest] = toDecimalString(paise).split('.') as [string, string];
  // Indian grouping: last 3 digits, then groups of 2.
  const last3 = rupees.slice(-3);
  const head = rupees.slice(0, -3);
  const grouped = head ? `${head.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `₹${grouped}.${rest}`;
}

export function sumPaise(values: readonly Paise[]): Paise {
  return values.reduce((a, b) => a + b, 0n);
}
