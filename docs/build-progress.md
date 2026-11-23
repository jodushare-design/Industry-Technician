# Build Progress

The working log for the phased build in the "Claude Code Master Prompt Sequence". Any session that continues the work starts here.

**Mode:** autonomous. The user asked, on 2026-11-22, to work through all prompts without stopping for review, to commit after each phase, and to resume after usage limits reset.

| Phase | Prompt | Status | Commit |
|---|---|---|---|
| Discovery and business model | 0 | Done | 43911de |
| Journeys, responsibility, legal drafts, compliance | 1–2 | Done | 43911de |
| Technical foundation (monorepo, auth, roles, RLS, CI) | 3 | Done | 43911de |
| Catalogue and rice-mill starter taxonomy | 4 | Done | c2a308b |
| Onboarding: customers, technicians, companies, verification | 5 | Done (web + admin; Android onboarding forms pending) | see git log |
| Requests and provider discovery | 6 | Done (web + admin; Android request forms pending) | see git log |
| In-app chat and optional WhatsApp hand-off | 7 | Done (web; Android chat pending) | see git log |
| Estimates and customer approval | 8 | Done (web) | see git log |
| Spare-parts coordination | 9 | Done (web) | see git log |
| Job states, completion, complaints | 10 | Done (web + admin) | see git log |
| Admin, compliance, security tests | 11 | Done (admin reports + settings, rate limits, security suite, legal review checklist; see docs/security.md for known gaps) | see git log |
| Pilot test plan and release docs | 12 | Done: pilot journey tests (`supabase/tests/pilot.test.ts`), `docs/pilot-test-plan.md`, `docs/release/`. **Not production-ready**: manual phone tests, hosted-project checks, legal review and Android parity are outstanding (`docs/release/known-limitations.md`) | d772ea1 + docs commit |

## How to continue

1. Read `CLAUDE.md` (project rules) and the latest `git log`.
2. Pick the first phase above that is not Done. The full prompt text is in the user's original "Master Prompt Sequence". Each phase's summary is in the docs listed in `README.md`.
3. Keep `npm run check` green (guards, typecheck, PGlite database tests). Build `web` and `admin` before committing.
4. Commit at the end of each phase. Update this table.

## Things that need the user (cannot be done autonomously)

- Creating the Supabase dev project, SMS/OTP provider and DLT registration, and the Expo account (docs/setup.md).
- Legal review of `docs/legal-review/*` and the compliance decisions.
- Approving the starter catalogue with a rice-mill technician; researching manufacturers and models (`docs/catalogue-research-worklist.md`).
- Trusting the repository in Claude Desktop before side sessions can run in it.
