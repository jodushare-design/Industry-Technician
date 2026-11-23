# Security

How the platform protects accounts, jobs, conversations and documents, and how each protection is tested. This covers the Prompt 11 security requirements.

**The database is the final authority.** Every rule below is enforced in Postgres: row level security, `SECURITY DEFINER` functions and triggers. The website, admin portal and Android app also check permissions to show the right screens, but a client that skips those checks still gets nothing it should not have.

Run everything with `npm run check`. The database tests run in-process on PGlite with a small Supabase stand-in, `supabase/local/shim.sql`. Before each release, also run them against a hosted dev project ([setup.md §7](setup.md)).

## Headline guarantees

Each guarantee has one test in [`supabase/tests/security.test.ts`](../supabase/tests/security.test.ts). That test builds the demo world plus a second customer and a second company. Each test also checks that the owner *can* see the record, so a denial cannot pass just because nothing is visible to anyone.

| Guarantee | How it is enforced |
|---|---|
| Customer A cannot see Customer B's jobs | `service_requests` and all job tables use `private.can_view_request()`: the customer, invited or engaged providers, and staff. |
| Technician A cannot see Technician B's private jobs | A provider sees a request only after being invited to it (`private.is_request_provider`). `get_request_for_provider` returns nothing to others. |
| Company A cannot see Company B's employee records | Company records use `private.can_manage_provider` / `private.is_org_member`. Identity documents of employees are not readable even by their own company admin (`private.can_read_storage_path`). |
| Nonparticipants cannot access conversations | `private.is_conversation_participant` (fixed after a NULL-logic bug; see CLAUDE.md). Staff read a conversation only through `staff_read_conversation`, which needs a linked complaint and is audited. |
| Only the authorised customer can approve an estimate or part cost | `decide_estimate` / `decide_part` check that the caller is the request's customer, and the approval carries a sha256 fingerprint of the content approved. Direct table updates are not granted. |
| Private identity documents are never publicly accessible | Every storage bucket is private. Objects are readable only through policies, using short-lived signed URLs. Anonymous visitors cannot query `provider_documents` at all. |

The feature suites (`onboarding`, `requests`, `chat`, `estimates`, `parts`, `completion`) contain the detailed denial cases for each function.

## Controls

| Requirement | Implementation | Tests |
|---|---|---|
| **Role-based permissions** | Roles in `user_roles` (customer, technician, company admin, company technician, support agent, platform admin). Checked by `private.has_role` and the helpers built on it, which never return NULL. Staff and platform-admin-only functions call `private.require_staff()` or check `private.is_platform_admin()`. Staff cannot approve, estimate or assign. The admin portal checks `requireStaff()` on every page and action (`apps/admin/src/lib/dal.ts`). | foundation, onboarding, security (settings, reports) |
| **Row level security** | Enabled on every public table, with explicit grants and policies. A meta-test fails if any public table lacks RLS. Every `SECURITY DEFINER` function pins `search_path = ''` (meta-test). | security → platform invariants, plus every feature suite |
| **Private file storage** | Six private buckets: provider documents, request media, chat media, part photos, job photos, complaint files. Upload policies require the uploader's own folder: provider profile, request or complaint. `private.can_read_storage_path` decides reads. | onboarding (documents), requests (media), security |
| **Signed URLs** | Clients never get public URLs. They ask Storage for a signed URL that expires after 1–10 minutes (identity documents: 1 minute), and Storage checks the read policy first. Approved providers' accepted work photos are the only files shown on public profiles, and still through signed URLs. | onboarding (work photos), security |
| **Attachment restrictions** | Each bucket has a size limit and a MIME allow-list. No HTML, script, SVG or executable types (meta-test). Tables repeat the checks (`size_bytes`, `mime_type`). Clients validate first for a better message (`@itm/core` media helpers). | security → storage buckets, requests (wrong media types) |
| **Rate limits** | Database triggers count actions per signed-in account (`private.rate_limit_hits`, not reachable through the API) against limits in `platform_settings`: service requests, provider invitations, chat messages, uploads and complaints. Catalogue suggestions keep their own limit of 20 a day. Platform admins change limits in **Admin → Settings** (validated, audited). The authentication service limits sign-in codes ([below](#authentication)). | security → rate limits, catalogue (suggestions) |
| **Secure authentication** | Phone number + one-time code (Supabase Auth). No passwords. Sessions in cookies, refreshed by `proxy.ts`. The admin portal uses its own cookie name (`sb-itm-admin-auth`), so a website session never becomes a staff session on the same host. Suspended or closed accounts are refused by `private.require_active_user()` in every write. | foundation (account status), manual demo check |
| **Server-side validation** | Server actions validate with zod (`@itm/core` validation). The database validates again: check constraints, enum types, and `ITM:<rule>` errors in every business function. The client never decides a business rule alone. | every feature suite |
| **Audit logging** | `private.audit()` records the actor, action, entity and details for every business-meaningful write. This includes approvals, verification, status changes, staff reads of conversations and settings changes. `audit_log` is append-only: update, delete and truncate are blocked by triggers. Staff see it in **Admin → Audit log**. | foundation, security → audit log |

### Platform-wide invariants (meta-tests)

`security.test.ts → platform invariants` fails the build if:
- a public table has RLS disabled;
- a `SECURITY DEFINER` function does not pin an empty `search_path`;
- anonymous visitors can call any public function other than `search_catalogue` and `get_provider_public`;
- an anonymous write to any public table affects a row;
- a storage bucket is public, has no size limit, or allows HTML, script, SVG or executable types;
- a file can be uploaded into another person's folder;
- the audit log can be changed, or read by ordinary users.

### Secrets

- The service-role / secret key is never used in `apps/*` or the client packages; `npm run guard` enforces this.
- Privileged background work belongs in Supabase Edge Functions.
- `.env*` files are not committed. The `.env.example` files contain placeholders only (guard).
- The local demo uses a public signing secret (`scripts/demo/jwt.mjs`). It must never be exposed to a network or used with real data.

### Web hardening

Both Next.js apps send:
- `X-Content-Type-Options: nosniff`;
- `Referrer-Policy: strict-origin-when-cross-origin`;
- `X-Frame-Options: DENY`;
- a restrictive `Permissions-Policy`.

The admin portal is marked `noindex`.

## Authentication

| Control | Setting |
|---|---|
| Sign-in method | Phone OTP only (6 digits). Email and anonymous sign-in are off. |
| Code resend interval | 60 seconds per phone (`[auth.sms] max_frequency`) |
| SMS sent per hour | 10 (`[auth.rate_limit] sms_sent`; set again in the hosted project) |
| Code checks per 5 minutes per IP | 15 (`token_verifications`) |
| Sign-ins per 5 minutes per IP | 30 (`sign_in_sign_ups`) |
| Fixed test codes | Local `supabase/config.toml` and the demo only. Never configured in a hosted project. |

The hosted project's Auth settings must match this table. Check them before the pilot goes live.

## Known gaps (before public launch)

These are tracked in [compliance-checklist.md](compliance-checklist.md):

- **No Content-Security-Policy header yet.** Add one once the final domains, Storage and analytics origins are known.
- **No data-rights tools yet:** self-service data export, correction and erasure requests, and scheduled retention and deletion. These wait on counsel's retention schedule (checklist §3.4–3.5).
- **No dedicated content takedown action.** Staff can suspend accounts and reject profiles today (checklist §2.4).
- **No error-monitoring vendor chosen.** `reportError` logs to the console until one is chosen, and the choice needs a processor agreement.
- **Supabase session cookies are readable by JavaScript.** The browser client needs them that way. This makes cross-site scripting the main token risk, which the CSP above will reduce.
