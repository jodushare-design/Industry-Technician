# Industrial Technician Marketplace (Hyderabad)

A technology marketplace that connects industrial customers with **independent technicians and service companies**. The platform provides discovery, a machine catalogue, in-app chat, estimate and approval records, parts coordination and a complaint channel.

It does **not** employ technicians, perform or supervise repairs, sell parts or collect payments (V1). See [docs/business-model.md](docs/business-model.md).

## Repository

```
apps/web       Next.js website (customers, providers)       :3000
apps/admin     Next.js admin portal (platform staff)        :3001
apps/mobile    Expo Android app
packages/core  roles, permissions, validation, errors, INR money, wording rules
packages/types database + domain types
packages/api   typed Supabase service layer
packages/next  Next.js session helpers
packages/ui    shared web components
supabase/      migrations, seed, RLS tests (PGlite)
scripts/guards CI guards (wording, secrets, payments, legal drafts)
docs/          business, legal-review drafts, architecture, setup
```

## Quick start

```powershell
npm install
```
```powershell
npm run check
```

Then follow [docs/setup.md](docs/setup.md) to connect a Supabase dev project.

## Documents

| Document | |
|---|---|
| [discovery-report.md](docs/discovery-report.md) | Prompt 0 — architecture and plan |
| [business-model.md](docs/business-model.md) | What the platform is and is not |
| [user-journeys.md](docs/user-journeys.md) | All user groups, step by step |
| [platform-responsibility-model.md](docs/platform-responsibility-model.md) | Who is responsible for what |
| [risk-control-design.md](docs/risk-control-design.md) | Product features that enforce the model |
| [legal-review/](docs/legal-review/) | 12 draft legal templates — **DRAFT — LEGAL REVIEW REQUIRED** |
| [compliance-checklist.md](docs/compliance-checklist.md) | Items for counsel and CA |
| [catalogue.md](docs/catalogue.md) | Machine catalogue: model, rules, import/export, admin workflow |
| [catalogue-research-worklist.md](docs/catalogue-research-worklist.md) | Research still needed (manufacturers, models, local-language names) |
| [onboarding.md](docs/onboarding.md) | Customer, technician and company onboarding; verification rules |
| [requests.md](docs/requests.md) | Service requests, matching and invitations |
| [chat.md](docs/chat.md) | In-app chat, notifications, optional WhatsApp hand-off and future WhatsApp design |
| [estimates.md](docs/estimates.md) | Estimates, revisions and customer approval |
| [parts.md](docs/parts.md) | Spare-parts coordination |
| [build-progress.md](docs/build-progress.md) | Phase status and how to continue |
| [architecture.md](docs/architecture.md) | Technical architecture and diagrams |
| [setup.md](docs/setup.md) | Environment and deployment setup |
