# Project rules for Claude Code

This is a **marketplace provider**, not a repair company. Read `docs/business-model.md` before changing user-facing text or data models.

## Non-negotiables

- Never write UI text that implies the platform employs, dispatches or guarantees providers ("our technicians", "we will repair", "guaranteed", "certified" outside the reviewed-certificate badge). `npm run guard` enforces this.
- Only the **customer** may approve an estimate or a part cost — not support staff, not platform admins. Enforce in SQL, not only in TypeScript.
- No payment, wallet, commission or order tables or SDKs in V1.
- Never use the Supabase service-role / secret key in `apps/*` or client packages. Privileged work goes in Supabase Edge Functions.
- Every new table: RLS enabled, explicit grants, policies, and PGlite tests in `supabase/tests` (including cross-tenant denial).
- Business-meaningful writes go through `SECURITY DEFINER` functions with `set search_path = ''`, call `private.require_active_user()`, and write `private.audit(...)`.
- Business-rule errors: `raise exception 'ITM:<rule_code>: <user message>'`.
- Boolean access helpers must never return NULL: use `exists (...)` or `coalesce(..., false)`. `x in (list-with-null)` and `false or null` are NULL, and `if not <NULL>` does not raise — this caused two access bugs (chat participants, estimate drafting).
- Money: `numeric(12,2)` INR in SQL, `bigint` paise in TS (`@itm/core` money helpers). Never floats.
- Never delete complaints, approvals, estimates or audit records when an account is suspended or closed.
- Legal text stays marked **DRAFT — LEGAL REVIEW REQUIRED** until `docs/legal-review/README.md` says Approved.

## Commands

- `npm run check`: guards + typecheck + all tests (run before declaring work done)
- `npm run build:web` / `npm run build:admin`
- Mobile: `npx expo install <pkg>` (never plain npm for Expo packages); `npx expo-doctor`

## Framework notes

- Next.js 16: read `node_modules/next/dist/docs/` before using unfamiliar APIs. `middleware` is now `proxy.ts`. Cache Components is deliberately off.
- Expo SDK 58: check the versioned docs at docs.expo.dev before using Expo APIs.
