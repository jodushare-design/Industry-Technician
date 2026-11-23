/**
 * Repository guards — run by `npm run guard` and in CI on every push.
 *
 *  1. copy-lint      — no wording that makes the platform the repair contractor (business-model.md §5)
 *  2. no-secrets     — client apps/packages never reference the service-role / secret key
 *  3. no-payments    — no payment SDKs in V1 (risk-control-design.md §13)
 *  4. legal drafts   — every legal-review draft is marked and has a review status
 *
 * A line can opt out of copy-lint with the comment `copy-lint-allow: <reason>`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { findCopyViolations } from '../../packages/core/src/copy-rules';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['node_modules', '.next', '.expo', 'dist', 'build', 'android', 'ios', 'test', 'tests', '.turbo']);

function walk(dir: string, exts: string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, exts, out);
    } else if (exts.some((e) => name.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => relative(ROOT, f).replace(/\\/g, '/');
const clientSourceDirs = ['apps/web/src', 'apps/admin/src', 'apps/mobile/src', 'packages/ui/src', 'packages/next/src', 'packages/api/src'];
const clientFiles = clientSourceDirs.flatMap((d) => walk(join(ROOT, d), ['.ts', '.tsx']));

describe('copy-lint: marketplace wording', () => {
  it('UI source contains no banned phrases', () => {
    const problems: string[] = [];
    for (const file of clientFiles) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (line.includes('copy-lint-allow')) return;
          for (const v of findCopyViolations(line)) {
            problems.push(`${rel(file)}:${i + 1} "${v.match}" — ${v.reason} ${v.suggestion}`);
          }
        });
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

describe('no-secrets: client code never holds privileged keys', () => {
  const FORBIDDEN = [/SERVICE_ROLE/i, /SUPABASE_SECRET/i, /sb_secret_[A-Za-z0-9]/];
  // assertPublicKey() names these on purpose to reject them.
  const ALLOWED = new Set(['packages/api/src/client.ts']);

  it('apps and shared client packages do not reference service-role or secret keys', () => {
    const problems: string[] = [];
    for (const file of clientFiles) {
      if (ALLOWED.has(rel(file))) continue;
      const text = readFileSync(file, 'utf8');
      for (const re of FORBIDDEN) if (re.test(text)) problems.push(`${rel(file)} matches ${re}`);
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });

  it('.env.example files contain only public placeholders', () => {
    const examples = walk(ROOT, ['.env.example']);
    expect(examples.length).toBeGreaterThan(0);
    for (const file of examples) {
      const text = readFileSync(file, 'utf8');
      expect(text, rel(file)).not.toMatch(/SERVICE_ROLE|SECRET_KEY|sb_secret_|eyJ[A-Za-z0-9_-]{20,}/);
    }
  });

  it('no real .env files are tracked next to examples', () => {
    const gitignore = readFileSync(join(ROOT, '.gitignore'), 'utf8');
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toMatch(/^!\.env\.example$/m);
  });
});

describe('no-payments: V1 collects no money', () => {
  const PAYMENT_SDK = /(razorpay|stripe|payu|cashfree|paytm|instamojo|juspay|phonepe|ccavenue|billdesk|braintree|paypal)/i;

  it('no package.json depends on a payment SDK', () => {
    const manifests = walk(ROOT, ['package.json']).filter((f) => !rel(f).includes('node_modules'));
    const problems: string[] = [];
    for (const file of manifests) {
      const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, Record<string, string> | undefined>;
      for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
        for (const dep of Object.keys(pkg[field] ?? {})) {
          if (PAYMENT_SDK.test(dep)) problems.push(`${rel(file)} → ${dep}`);
        }
      }
    }
    expect(problems, problems.join('\n')).toEqual([]);
  });
});

describe('legal drafts', () => {
  const dir = join(ROOT, 'docs', 'legal-review');
  const drafts = readdirSync(dir).filter((f) => /^\d{2}-.*\.md$/.test(f));

  it('there are 12 drafts', () => {
    expect(drafts).toHaveLength(12);
  });

  it.each(drafts)('%s is marked DRAFT — LEGAL REVIEW REQUIRED and has a review status', (f) => {
    const text = readFileSync(join(dir, f), 'utf8');
    expect(text).toContain('DRAFT — LEGAL REVIEW REQUIRED');
    expect(text).toMatch(/Legal review status \| \*\*(Not started|In review|Changes requested|Approved|Withdrawn)\*\*/);
  });

  it('seed.sql registers every draft code with the same status', () => {
    const seed = readFileSync(join(ROOT, 'supabase', 'seed.sql'), 'utf8');
    for (const f of drafts) {
      const code = /Document code \| `([a-z_]+)`/.exec(readFileSync(join(dir, f), 'utf8'))?.[1];
      expect(code, f).toBeDefined();
      expect(seed, `${code} missing from seed.sql`).toContain(`'${code}'`);
    }
  });
});
