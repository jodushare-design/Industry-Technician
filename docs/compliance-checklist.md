# Compliance Checklist

> **DRAFT — LEGAL REVIEW REQUIRED.** This is a product team's list of topics to take to an Indian lawyer and a chartered accountant. It is **not legal or tax advice**. Laws, rules and their commencement dates change, so every "Verify" item must be confirmed by counsel against the law in force on the launch date.

**Prepared:** 2026-11-22. **Overall status:** Not reviewed.

**Status values:**
- `Open` — not yet reviewed
- `With counsel` — sent to the lawyer or accountant
- `Decided` — counsel has given a decision
- `Built` — the product changes are made
- `N/A (confirmed)` — counsel confirmed it does not apply

---

## 1. Consumer Protection Act, 2019 and Consumer Protection (E-Commerce) Rules, 2020

| # | Item | Why it matters / product impact | Owner | Status |
|---|---|---|---|---|
| 1.1 | Is the platform a "marketplace e-commerce entity"? | Determines the Rules' disclosure and grievance duties. We plan as if it is, until told otherwise. | Counsel | Open |
| 1.2 | Do industrial customers count as "consumers"? | The Act excludes services availed for a commercial purpose, with exceptions (e.g. self-employment). This decides how much of the Act protects our B2B users. | Counsel | Open |
| 1.3 | Entity details and Grievance Officer shown on the platform | Footer and "About" page show the entity name, address, contact and Grievance Officer | Product | Open |
| 1.4 | Grievance acknowledgement and redress timelines | Product default is the stricter of the possibly applicable regimes (risk-control §9) | Counsel / Product | Open |
| 1.5 | Provider information shown to customers | Provider name, business details and address as the Rules require for "sellers" | Counsel / Product | Open |
| 1.6 | Explicit consent, no pre-ticked boxes, no dark patterns | Check against the Guidelines for Prevention and Regulation of Dark Patterns, 2023. Check unticked checkboxes, approval screens, and that there are no fake-urgency timers. | Product | Open |
| 1.7 | Unfair contract terms in the Terms of Use | Review of the limitation-of-liability and indemnity clauses | Counsel | Open |
| 1.8 | Ratings and reviews (if added later) | Fake-review controls; consider the voluntary IS 19000:2022 standard for online consumer reviews | Product | Open (not V1) |

## 2. Information Technology Act, 2000 and IT (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021

| # | Item | Product impact | Owner | Status |
|---|---|---|---|---|
| 2.1 | Does the platform qualify as an intermediary for user content (chat, profiles, uploads)? Does safe-harbour (s.79) apply? | Due-diligence duties | Counsel | Open |
| 2.2 | Rules and user notices published (privacy policy, user agreement, prohibited content) | Docs 01–07 | Counsel | Open |
| 2.3 | Grievance Officer, complaint acknowledgement and disposal timelines | Same complaint system as §1.4 | Counsel / Product | Open |
| 2.4 | Takedown on court or government order within the required time | Admin "content takedown" action plus audit | Product | Open |
| 2.5 | Log and record retention when required by law; cyber-incident reporting to CERT-In (CERT-In Directions, 2022) | Log retention settings; incident runbook | Engineering | Open |
| 2.6 | Reasonable security practices (s.43A / SPDI Rules, if still relevant alongside DPDP) | Security controls in Prompt 11 | Counsel / Engineering | Open |
| 2.7 | Electronic contract and approval evidence | OTP-authenticated approvals, hashes, timestamps (risk-control §4) | Counsel | Open |

## 3. Digital Personal Data Protection Act, 2023 and DPDP Rules

| # | Item | Product impact | Owner | Status |
|---|---|---|---|---|
| 3.1 | **Verify** which obligations under the DPDP Rules are in force on the launch date, and which come into force later under the phased commencement | Plan launch against obligations in force + those due soon | Counsel | Open |
| 3.2 | Notice and consent: itemised, in clear language, [Indian-language versions?], withdrawal as easy as giving | Consent screens; `consent_record` table | Product | Open |
| 3.3 | Legitimate-use bases where consent isn't used | Privacy Policy §3 | Counsel | Open |
| 3.4 | Data principal rights: access, correction, erasure, grievance, nomination | Self-service export / correction; erasure request workflow with retention exceptions | Product | Open |
| 3.5 | Retention and erasure schedule per record type | Retention jobs (Prompt 11) | Counsel / Engineering | Open |
| 3.6 | Breach notification to the Data Protection Board and affected users | Incident runbook | Counsel / Engineering | Open |
| 3.7 | Processor contracts (Supabase, SMS gateway, FCM/Expo, Sentry) | Data processing agreements; region choice (Supabase Mumbai region preferred) | Counsel / Founder | Open |
| 3.8 | Children's data | Users must be 18+; age declaration at sign-up | Product | Open |
| 3.9 | Who is data fiduciary for customer data given to providers, and for employee data entered by company admins? | Terms 02/03 data clauses | Counsel | Open |
| 3.10 | Significant Data Fiduciary designation | Unlikely at pilot scale; confirm | Counsel | Open |

## 4. GST and tax

| # | Item | Product impact | Owner | Status |
|---|---|---|---|---|
| 4.1 | GST registration threshold and timing for the platform company (services; Telangana) | — | CA | Open |
| 4.2 | GST on any platform fees (listing or subscription fees from providers, if introduced) | No fees in V1 unless decided | CA | Open |
| 4.3 | E-commerce operator provisions — TCS under CGST s.52; operator liability under s.9(5). **Expected not to apply while the platform collects no consideration.** | Keep the no-payment guarantee (risk-control §13) | CA | Open |
| 4.4 | Income-tax TDS on e-commerce (s.194-O) | Expected not to apply without payment facilitation; confirm | CA | Open |
| 4.5 | Provider GSTIN capture and display on estimates (optional field); tax line is provider-entered | Estimate form | Product | Open |
| 4.6 | Re-assessment trigger: any future payment collection or commission | Business-model doc §8 | Founder | Open |

## 5. Company registration and business set-up

| # | Item | Owner | Status |
|---|---|---|---|
| 5.1 | Entity type (Private Limited / LLP), incorporation with MCA | Founder / CS | Open |
| 5.2 | PAN, TAN, bank account, GST (per §4) | Founder / CA | Open |
| 5.3 | Telangana Shops and Establishments registration (office) | Founder | Open |
| 5.4 | Trademark search and filing for the platform name; domain | Founder / Counsel | Open |
| 5.5 | Optional: DPIIT Startup India recognition; Udyam registration | Founder | Open |
| 5.6 | SMS sender ID and DLT template registration (TRAI TCCCPR) for OTP and notifications | Founder / Engineering | Open |

## 6. Employment and independent-contractor classification

| # | Item | Product impact | Owner | Status |
|---|---|---|---|---|
| 6.1 | **Code on Social Security, 2020: are providers "platform workers", and is the company an "aggregator"?** Covers any registration, worker data-sharing with the government portal, and contributions to a social security fund. Verify the commencement status and the Telangana rules. | Possible statutory contribution and reporting; data fields | Counsel | Open |
| 6.2 | Product features avoid employment-style control: no mandatory hours, no platform-set prices, no dispatch, no uniforms | Design rule (responsibility model §1, doc 11) | Product | Open |
| 6.3 | Company employees remain the employer company's responsibility | Doc 03 | Counsel | Open |
| 6.4 | Telangana-specific gig/platform worker laws (check whether any are enacted or proposed) | — | Counsel | Open |
| 6.5 | Platform's own staff (support/admin): normal employment compliance | Founder | Open |

## 7. Industrial safety and regulated work

| # | Item | Product impact | Owner | Status |
|---|---|---|---|---|
| 7.1 | Customer as occupier/employer under the factory and occupational-safety laws (Factories Act 1948 / OSH Code 2020, as in force): site safety duties stay with the site | Site safety acknowledgement (risk-control §6); terms wording | Counsel | Open |
| 7.2 | Electrical work: licensed contractor/supervisor requirements under the Central Electricity Authority safety regulations and Telangana licensing | `regulated_work` flag on electrical panels, motors/VFD installation; licence badge | Counsel / Product | Open |
| 7.3 | Boilers: repairs by approved/registered boiler repairers under the boiler law in force (Boilers Act 1923 or its replacement — verify) and IBR | Boiler category flagged; reminder; licence badge | Counsel / Product | Open |
| 7.4 | Pressure vessels / air receivers, gas cylinders (SMPV(U) / Gas Cylinders Rules where applicable) | Compressor/receiver flag | Counsel | Open |
| 7.5 | Lifts, hoists, cranes: statutory inspection and competent-person requirements | Material-handling flag | Counsel | Open |
| 7.6 | Should regulated skills require a reviewed licence before being listed? (Responsibility model §5 Q3) | Onboarding rule | Counsel / Founder | Open |
| 7.7 | Incident escalation procedure and evidence preservation | Prompt 10 runbook | Product | Open |
| 7.8 | The platform never gives technical or safety instructions as its own advice | Copy lint; help-content review | Product | Open |

## 8. Insurance

| # | Item | Owner | Status |
|---|---|---|---|
| 8.1 | Platform: professional indemnity / technology errors & omissions | Founder / Broker | Open |
| 8.2 | Platform: cyber liability (data breach) | Founder / Broker | Open |
| 8.3 | Platform: commercial general/public liability (office, events, pilot visits) | Founder / Broker | Open |
| 8.4 | Providers: public liability; Employees' Compensation insurance for their staff. Recommended or required? (Docs 02/03) | Counsel / Founder | Open |
| 8.5 | Insurance badge only after a policy document and expiry date have been reviewed | Product | Open |

## 9. WhatsApp and messaging

| # | Item | Product impact | Owner | Status |
|---|---|---|---|---|
| 9.1 | V1: user-initiated `wa.me` hand-off only, after consent from both parties; no job data prefilled without the user's choice | Risk-control §8 | Product | Open |
| 9.2 | DPDP notice that data shared on WhatsApp leaves the platform | Privacy Policy §12 | Counsel | Open |
| 9.3 | Future WhatsApp Business Platform: opt-in records, approved templates, 24-hour customer-service window, opt-out handling, Meta Business/Commerce policies, per-conversation pricing | Future design doc (Prompt 7) | Product / Counsel | Open (not V1) |
| 9.4 | SMS: DLT registration, promotional vs transactional categories, consent for promotional messages | §5.6 | Engineering | Open |

## 10. Launch gate

The product cannot launch publicly until:

- [ ] All documents in [`legal-review/`](legal-review/) marked "Required at launch" are `Approved`
- [ ] §1.1, §1.2, §2.1, §3.1, §4.3 and §6.1 are `Decided`
- [ ] §7.2–7.6 decisions are built into the catalogue and onboarding
- [ ] Platform insurance (§8.1–8.2) is in place or knowingly deferred by the founder in writing
- [ ] The Grievance Officer is appointed and their details are published
