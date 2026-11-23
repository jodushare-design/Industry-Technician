# Prompt 0 — Project Discovery and Architecture Report

**Project:** Industrial Technician Marketplace (Hyderabad, India)
**Date:** 2026-11-22
**Status:** For review. No application code is written until this report and `business-model.md` are approved.

---

## 1. Existing project architecture

**There is no existing project.** This is a greenfield build.

What was checked on this machine (`C:\Users\yedu_`):

| Location | What it is | Relevant? |
|---|---|---|
| `CSP_Trade` | Next.js + Prisma options-trading decision tool | No — different product. Left untouched. |
| `CrowedShipping` | Claude Code handoff pack (backend, mobile, prototype) for a shipping product | No |
| `RMN` | Claude Code pack for a Nalgonda district pilot, plus village/district data files | No |
| `JYNSandbox` | Salesforce DX project | No |

Nothing in these folders mentions technicians, industrial machines or rice mills.

So the following items from Prompt 0 have no existing answer:

| Item | Finding |
|---|---|
| Application framework | None |
| Website | None |
| Android app | None |
| Database | None |
| Authentication | None |
| Backend APIs | None |
| UI components | None |
| Hosting and deployment | None |
| Catalogue data | None |

A new repository was created at `C:\Users\yedu_\IndustrialTechMarketplace` (git, branch `main`, no commits yet).

### Development environment found

| Tool | Status | What it means |
|---|---|---|
| Node.js | v26.5.0 | Fine for Next.js and Expo |
| npm | 12.0.1 | Fine |
| git | 2.55 | Fine |
| Supabase CLI | 2.121.0 | Can create migrations and link to a hosted project |
| Docker | **Not found** | `supabase start` (the local database stack) needs Docker. Without it we must develop against a hosted Supabase dev project. |
| Java | OpenJDK 21 | Enough for Android Gradle builds |
| Android SDK / `adb` | **Not found** (`ANDROID_HOME` unset) | No local Android builds or emulator. Use Expo Go on a phone and EAS cloud builds instead. |
| EAS CLI | Not installed | Install when we reach the Android phase (`npx eas-cli`) |

## 2. Current functionality

None.

## 3. Missing functionality

All of it. In V1 scope, by phase:

| Area | Prompt |
|---|---|
| Business, legal and responsibility documents | 0, 1, 2 |
| Monorepo, auth, roles, RLS, migrations, shared types | 3 |
| Industrial and rice-mill catalogue with sourcing and admin approval | 4 |
| Customer, technician and company onboarding and verification | 5 |
| Service requests, provider matching and selection | 6 |
| Job-linked chat with attachments; optional consented WhatsApp hand-off | 7 |
| Estimates, revisions and customer approval | 8 |
| Spare-parts coordination | 9 |
| Job status machine, completion reports, complaints and escalation | 10 |
| Admin portal, security tests, compliance checklist | 11 |
| Pilot test plan and release | 12 |

## 4. Technical problems

There is no code yet, so these are environment and design risks:

1. **No Docker.** We can't run Supabase locally. We need a separate hosted Supabase project for development and must never point development work at production. RLS tests will run against that dev project.
2. **No Android SDK.** We rely on Expo Go and EAS Build, which needs an Expo account (the user creates it).
3. **Node 26 is very new.** Some Expo and React Native tooling only supports LTS versions. If installs fail, pin Node 22 LTS for the project.
4. **Two clients sharing one backend.** Business rules (estimate immutability, status transitions, approval rights) must live in the database (constraints, RLS, Postgres functions), not only in TypeScript. Otherwise the web app and the Android app will drift apart.
5. **Media-heavy chat on slow networks.** Video and voice uploads need resumable or chunked upload, client-side compression and retry.
6. **Catalogue scale and search.** Aliases, local-language names and spelling mistakes ("dehusker" / "husker" / "sheller") need trigram or full-text search with an alias table, not exact-match lists.

## 5. Security issues to design for (none exist yet)

| Risk | Control planned |
|---|---|
| Service-role key leaking to the client | Used only in server code (Next.js route handlers, Edge Functions). CI grep check that fails the build if `SERVICE_ROLE` appears in client bundles or Expo config. |
| Cross-tenant data access | RLS on every table, default deny. Automated tests for each rule in Prompt 11 (Customer A ≠ B, Company A ≠ B, conversation non-participants, estimate approval only by the owning customer). |
| Identity and business documents | Private storage bucket, short-lived signed URLs, admin-only read. Never shown to customers. |
| Phone numbers exposed | Masked by default. Revealed only through the consented contact-share flow (Prompt 7). |
| OTP abuse and SMS cost | Rate limits per number and per IP. Supabase Auth phone provider with an Indian SMS gateway (MSG91 or Twilio), with DLT-registered templates. |
| Malicious uploads | MIME and size allow-list, image re-encoding, no executable types. Storage paths scoped by job and user. |
| Forged approvals | Approval is a Postgres function that checks `auth.uid()` = job customer. Accepted estimates are locked by trigger. |
| Audit integrity | Append-only `audit_log` table. No update or delete grants, including for admins. |
| Admin compromise | Separate admin role, MFA on admin accounts, admin actions written to the audit log. |

## 6. Database problems

None exist yet. Design rules for the new schema:

- Money uses `numeric(12,2)` with currency `INR`. Never `float`.
- Every status is a Postgres enum or a checked text column, and transitions are enforced by a function.
- Estimates are versioned rows (`estimate` → `estimate_revision`). An accepted revision is immutable (trigger).
- Soft delete and retention for complaints and evidence. Account suspension never cascades deletes into complaint records.
- Catalogue rows carry provenance: source URL, organisation, research date, verification date, confidence and status.
- Skills are stored per person per machine type. A company skill is never copied to its employees automatically.
- Verification is a set of separate dated status records, not one boolean `verified` flag.

## 7. Recommended architecture

```
IndustrialTechMarketplace/          (npm workspaces + Turborepo)
├── apps/
│   ├── web/        Next.js (App Router, TS) — customer + provider website
│   ├── admin/      Next.js — protected admin portal (separate deploy, admin role only)
│   └── mobile/     Expo / React Native (TS) — Android app
├── packages/
│   ├── types/      Generated Supabase DB types + domain types
│   ├── core/       Business rules: status transitions, estimate math, validation (Zod)
│   ├── api/        Typed data-access layer over supabase-js, used by all three apps
│   └── ui/         Shared tokens; web components (React) + native components where practical
├── supabase/
│   ├── migrations/ SQL migrations (schema, RLS, functions, triggers)
│   ├── functions/  Edge Functions (anything needing the service role: notifications, signed-URL issuance, imports)
│   ├── seed/       Catalogue starter data (CSV/JSON) + pilot test data
│   └── tests/      pgTAP RLS and rule tests
└── docs/           Business, legal-review and architecture documents
```

**Backend.** One Supabase project per environment (dev, staging, prod). It provides:
- Postgres with RLS
- Auth with phone OTP
- Storage with private buckets
- Realtime for chat and job status
- Edge Functions for privileged work

**Website and admin.** Hosted on Vercel, or any Node host. The Mumbai region (`bom1`) is closest to Hyderabad.

**Android.** Expo, EAS Build and EAS Update. Push notifications via Expo Notifications (FCM).

**Validation.** Zod schemas in `packages/core` are used by the client forms and re-checked on the server. Database constraints are the last line of defence.

**Testing.**
- Vitest for `core` and `api`
- pgTAP for RLS and database rules
- Playwright for web journeys
- Maestro or Detox for Android smoke tests (later phase)

**Error logging.** Sentry (web and mobile) plus Supabase logs.

**Business-model enforcement in code.** The marketplace boundary is built into the product, not just stated in documents:
- A UI copy lint list bans phrases such as "our technicians", "we will repair" and "guaranteed".
- There are no payment tables in V1.
- The estimate author is always the provider.
- The approval actor is always the customer.

## 8. Implementation sequence

| Phase | Prompt(s) | Output | Review gate |
|---|---|---|---|
| 0 | 0 | This report, `business-model.md` | **You are here** |
| 1 | 1 + 2 | User journeys, responsibility model, legal-review drafts, compliance checklist | Business and legal review |
| 2 | 3 | Monorepo, Supabase dev project, auth (phone OTP), roles, RLS baseline, CI | Auth + RLS tests pass |
| 3 | 4 | Catalogue schema, importers, rice-mill + general starter data with sources, admin catalogue screens | Inspect real data |
| 4 | 5 + 6 | Onboarding, verification, requests, matching | Customer and technician journey tests |
| 5 | 7 + 8 + 9 | Chat, estimates, parts | Messaging, estimate and parts approval tests |
| 6 | 10 + 11 | Job states, completion, complaints, admin portal, security tests | Security review |
| 7 | 12 | Rice-mill and general pilots, Android build, release docs | Critical tests pass |

## 9. Estimated complexity

Rough single-developer estimates with Claude Code doing most of the implementation. Calendar time depends mostly on your review turnaround and on outside accounts (Supabase, Expo, SMS/DLT).

| Phase | Complexity | Main drivers |
|---|---|---|
| 1 — Journeys + legal drafts | Low–Medium | Writing only; real cost is lawyer review time |
| 2 — Foundation | Medium | Monorepo + Expo + Supabase wiring; RLS test harness without Docker |
| 3 — Catalogue | **High** | Sourced, verifiable machine data; dedupe/merge/alias tooling; must not invent models |
| 4 — Onboarding + matching | Medium–High | Per-person skill model, company/employee separation, geo matching |
| 5 — Chat, estimates, parts | **High** | Realtime + media on slow networks; versioned, immutable estimates |
| 6 — Jobs, complaints, admin | Medium–High | State machine, escalation, broad admin surface |
| 7 — Pilot + release | Medium | End-to-end testing on real devices, release docs |

## Things you need to provide or decide

These are not needed yet, but are needed before Phase 2:

1. A Supabase account and a **dev** project (Mumbai `ap-south-1` region recommended for India data residency and latency).
2. An Expo account (for Android builds).
3. An SMS provider for OTP. India requires DLT template registration, which takes days, so start early.
4. Product/brand name and domain.
5. Whether to install Docker Desktop (enables a fully local database and faster RLS tests). Optional.
