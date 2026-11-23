# Known Limitations

As of 2026-11-23. **The platform is not production-ready.** Items marked **Before the pilot** must be closed, or knowingly accepted in writing by the founder, before the first pilot customer is invited.

## Needs the founder (cannot be done by engineering)

| Item | Blocks |
|---|---|
| Production Supabase project on a paid plan (Mumbai region), with backups / PITR | Before the pilot |
| SMS provider with an approved DLT sender ID and OTP template (TRAI) | Before the pilot |
| Grievance Officer appointed; name and contact set in the website settings | Before the pilot |
| Lawyer review of every document in [legal-review/](../legal-review/) and the questions in the [legal review checklist](../legal-review/legal-review-checklist.md). Until approved, every document stays **DRAFT — LEGAL REVIEW REQUIRED**. | Public launch. For the pilot, the founder decides in writing whether pilot users may accept the drafts (each acceptance records the draft status). |
| Chartered accountant: GST and e-commerce operator questions ([compliance-checklist §4](../compliance-checklist.md)) | Public launch |
| Starter catalogue reviewed with a practising rice-mill technician, then approved in the admin portal ([catalogue.md](../catalogue.md)) | Before the pilot |
| Company registration, domain and trademark | Public launch |
| Expo account and the real Android package name | Android release |
| Insurance decisions ([compliance-checklist §8](../compliance-checklist.md)) | Public launch |

## Product and engineering

| Limitation | Effect | Blocks |
|---|---|---|
| **Android app has sign-in and account screens only.** Requests, chat, estimates, parts, completion and complaints exist on the website only. | Pilot users use the website in their phone browser. Push notifications are not available. | Play Store release |
| Manual phone, slow-network and real-SMS tests not run ([test-results.md](test-results.md#manual-results)) | Behaviour on real phones and networks is unverified | Before the pilot |
| No performance budget; no Lighthouse baseline yet | Slow pages on low-end phones would go unnoticed | Before the pilot (record the baseline) |
| `expire_estimates()` is not scheduled until pg_cron is set up ([deployment.md §1](deployment.md)) | Expired estimates cannot be accepted, but their status is not updated | Before the pilot (part of deployment) |
| No staff-role screen in the admin portal; staff are granted by SQL ([deployment.md §4](deployment.md#4-admin-access-setup)) | SQL grants are not in the platform audit log | Pilot (recommended) |
| No error-monitoring service | Production errors only in host logs | Pilot (recommended) |
| No Content-Security-Policy header; no independent penetration test ([security-review.md](security-review.md)) | — | Public launch |
| No self-service data export, correction or erasure; no scheduled retention and deletion | DPDP duties handled manually by support | Public launch |
| No content takedown action (staff can suspend or reject today) | — | Public launch |
| Ratings are collected privately at confirmation and not shown publicly | By design for V1 | — |
| No payments, wallet, commission or orders | By design for V1: customers pay providers directly | — |
| Interface in English only; Telugu and Hindi names in the catalogue are still research items | Some users may need help in person during the pilot | Pilot onboarding covers this |
| WhatsApp only as a hand-off that both sides consent to; no WhatsApp Business integration | By design for V1 | — |
| Realtime chat is not available in the local demo, which polls every 30 s | Demo only | — |
| The customer request flow (quick request from a saved machine; posting when no provider matches) is being reworked in parallel | Re-run scripts B and C after it lands | Before the pilot |

## What the platform does not do (by design)

The platform is a technology marketplace. It does not employ technicians, send them to jobs, repair machines, inspect work, sell or source parts, or collect payments. Providers are independent businesses responsible for their own work, and customers choose and approve them. User-facing text must keep that clear ([business-model.md](../business-model.md)).
