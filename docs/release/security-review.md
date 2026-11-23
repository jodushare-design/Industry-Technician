# Security Review Summary

The full control-by-control description is in [docs/security.md](../security.md). This page summarises the review for the release decision.

**Reviewed:** 2026-11-23, by the engineering team, from the code and the automated tests. This is **not** an independent penetration test. Arrange one before a public launch.

## What is in place and tested

- **Database-enforced access.**
  - Row level security on every public table, plus a meta-test that fails the build if any table lacks it.
  - Every business write goes through a `SECURITY DEFINER` function that pins `search_path = ''`, checks the caller and writes the audit log.
- **The six headline guarantees,** tested with positive controls in `supabase/tests/security.test.ts`:
  - customers are isolated from each other;
  - technicians are isolated from each other's jobs;
  - companies are isolated from each other's employee records;
  - conversations are for participants only;
  - only the owning customer approves estimates and part costs;
  - identity documents are never public.
- **Private files.**
  - Six private buckets with size and type limits; no HTML, script, SVG or executable types.
  - Uploads only into folders the uploader may use.
  - Signed URLs that last 1–10 minutes (identity documents: 1 minute).
- **Approval evidence.** Each approved estimate revision, part cost and completion report is fingerprinted with sha256. An approval of content that changed is refused.
- **Rate limits** per account on requests, invitations, messages, uploads and complaints. Platform admins adjust them, and each change is audited. Sign-in codes are limited by Supabase Auth.
- **Authentication.**
  - Phone one-time codes only; no passwords.
  - Suspended accounts cannot write.
  - The admin portal has its own session cookie.
- **Secrets.**
  - No service-role or secret key in any app or client package, and none in example env files (guards in CI).
  - No payment SDKs (guard).
- **Audit log.** Append-only (update, delete and truncate are blocked). Readable by staff only.
- **Web headers.** `nosniff`, `X-Frame-Options: DENY`, strict referrer policy, permissions policy; the admin portal is `noindex`.

## Open findings

| # | Finding | Risk | Plan | Blocks |
|---|---|---|---|---|
| S1 | No Content-Security-Policy header | Medium. Supabase session tokens are readable by JavaScript, so cross-site scripting would expose sessions. React escaping limits that risk today. | Add a CSP once the production domains are known | Public launch |
| S2 | No independent security test | Medium | External penetration test of the website, admin portal and Supabase project | Public launch |
| S3 | No error-monitoring service | Low–medium: production errors are only in host logs | Choose a vendor with a processor agreement; register it in `reportError` | Pilot (recommended) |
| S4 | No data-rights tools (export, correction, erasure) and no scheduled retention | Compliance (DPDP) | Build after counsel sets the retention schedule | Public launch |
| S5 | No content takedown action | Compliance (IT Rules) | Admin action with audit; staff can suspend or reject today | Public launch |
| S6 | Staff roles are granted by SQL, not in the admin portal | Low: SQL grants are not in the platform audit log | Add a staff-role screen using `grant_staff_role` / `revoke_role` | Pilot (recommended) |
| S7 | Tests run on a local Supabase stand-in | Medium: hosted Auth, Storage and Realtime are not exercised automatically | Re-run the isolation scenarios against the hosted project before each release ([setup.md §7](../setup.md)) | Pilot |
| S8 | The local demo uses a public signing secret | Low if used as intended | Never expose the demo server or use it with real data; `demo:env` refuses to overwrite real settings | — |

**Conclusion:** the controls needed to protect pilot users' jobs, conversations and documents are in place and tested at the database level. Before the pilot: close S7, and preferably S3 and S6. Before a public launch: close S1, S2, S4 and S5.
