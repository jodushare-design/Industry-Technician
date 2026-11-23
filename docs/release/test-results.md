# Test Results

## Automated run: 2026-11-23

Commit `d772ea1` plus the working tree at the time of the run, on Windows 11 with Node 26.5 (CI uses Node 22). The command was `npm run check`: guards, then typecheck, then all tests.

| Step | Result |
|---|---|
| Guards: wording, no secrets in apps, no payment SDKs, legal drafts marked | **Pass**, 19 tests |
| Typecheck, all workspaces | **Pass** |
| Unit and database tests | **Pass**: 291 tests in 18 files, 0 failed, 0 skipped |

A second `npm run check` later the same day also passed: **299 tests in 19 files**. That run included the in-progress, not yet committed request-posting work (`supabase/tests/posting.test.ts` and its migration). Re-record the counts on the release commit.

The website and admin builds passed on the Prompt 11 commit (`931a709`). Re-run them on the release commit.

| Test file | Tests | Covers |
|---|---|---|
| `supabase/tests/catalogue.test.ts` | 40 | Catalogue search, aliases, approval rules, imports, suggestions, visibility |
| `supabase/tests/foundation.test.ts` | 28 | Auth → profile, roles, profile RLS, company isolation, legal acceptance, audit log |
| `supabase/tests/onboarding.test.ts` | 28 | Factories and machines, provider profiles, companies and employees, private documents, verification |
| `supabase/tests/requests.test.ts` | 20 | Creating requests, matching, invitations and selection, request media |
| `supabase/tests/security.test.ts` | 20 | The six headline guarantees, platform invariants, settings, rate limits, reports |
| `supabase/tests/pilot.test.ts` | 17 | Rice mill breakdown end to end (12 steps); five general-industry jobs |
| `supabase/tests/chat.test.ts` | 13 | Conversations, company assignment, contact sharing, media, closing |
| `supabase/tests/completion.test.ts` | 12 | Job progress, safety gate, completion report, confirmation, complaints, safety incidents |
| `supabase/tests/estimates.test.ts` | 12 | Drafts, sending, customer decisions, revisions, inspection estimates, expiry |
| `supabase/tests/parts.test.ts` | 11 | Part pricing, customer-only approval, stages, privacy |
| `packages/core/test/*` | 65 | Validation, money (paise), copy rules, roles, error mapping, request and estimate rules |
| `packages/api/test/api.test.ts` | 6 | Public-key check, service helpers |
| `scripts/guards/guards.test.ts` | 19 | Wording, secrets, payments, legal drafts |

**What this proves:** the database rules, access isolation and both pilot journeys behave as designed when called as each real user.

**What it does not prove:**
- behaviour on the hosted Supabase project with real Auth, SMS, Realtime and Storage (the tests use a local stand-in);
- how the apps look and perform on phones;
- slow-network behaviour;
- the Android app.

Those are the manual scripts below.

## Manual results

From [pilot-test-plan.md §3](../pilot-test-plan.md#3-manual-scripts). **None run on phones yet.** Parts of scripts B, C and E were clicked through in the local demo on a desktop browser on 2026-11-23:
- customer sign-in, request list and request page;
- chat and estimate approval;
- job confirmation page;
- admin dashboard, verification queue, complaints, reports and settings.

Two bugs found that way were fixed: a chat crash on newer browsers, and a session cookie shared between the website and the admin portal.

| Script | Device / browser | Environment | Date | Result | Notes |
|---|---|---|---|---|---|
| A. Sign-in (real SMS) | | Hosted dev project | | Not run | Needs the Supabase project and SMS/DLT |
| B. Customer breakdown on a phone | | | | Not run | |
| C. Chat and estimate | | | | Not run | |
| D. Parts, job and completion | | | | Not run | |
| E. Staff | | | | Not run | |
| F. Phones, slow network, offline | | | | Not run | |
| Isolation re-run on hosted project ([setup §7](../setup.md)) | | Hosted dev project | | Not run | |
| Restore drill ([backups.md](backups.md)) | | Restore project | | Not run | |

**Critical tests not yet passed:** A, F and the hosted isolation re-run. The release must not be called production-ready until they pass.
