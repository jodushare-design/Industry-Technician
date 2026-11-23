# Legal Review Checklist

> **DRAFT — LEGAL REVIEW REQUIRED.** A working list for the Indian lawyer and chartered accountant who review the platform before launch. It is **not legal or tax advice**. It does not conclude what the law requires, and it does not claim that the platform has no liability. Every answer below must come from counsel.

**Prepared:** 2026-11-23 by the product team. **Status:** Not reviewed.

**How to use it.** Work through each area in order. For each area:
- read the facts in "What the product does today";
- answer the questions;
- record the decision, the reviewer and the date in the "Decision" line.

Detailed items, owners and statuses are in [docs/compliance-checklist.md](../compliance-checklist.md). The draft documents are in this folder, with their status in the [README](README.md).

**The business model in one paragraph.** The company runs a technology marketplace. It lets industrial customers in Telangana (rice mills first) find, contact and work with independent technicians and service companies.
- The company does not employ the technicians.
- It does not send technicians to jobs, repair machines or sell spare parts.
- In version 1 it does not collect payments and takes no commission.

Customers choose providers. Providers write their own estimates. Customers approve estimates and spare-part costs themselves, with a one-time-code-verified sign-in and a recorded fingerprint of the approved content. See [business-model.md](../business-model.md) and [platform-responsibility-model.md](../platform-responsibility-model.md).

---

## 1. Indian e-commerce requirements

**What the product does today**
- Listings of providers; customer-initiated contact; in-app chat; estimates written by providers; approvals by customers.
- No checkout, payment, wallet or order flow. The codebase guard (`npm run guard`) blocks payment SDKs.
- Provider name, kind (independent / company) and service area are shown to customers. Business details are shown only after the provider accepts the request.

**Questions for counsel**
1. Is the company a "marketplace e-commerce entity" under the Consumer Protection (E-Commerce) Rules, 2020, even though no payment or order passes through it?
2. Which seller-information disclosures apply to providers, and where must they appear?
3. Do the approval screens, consent checkboxes and notifications meet the Dark Patterns Guidelines, 2023?
4. Which entity details must appear on the website and app, and where?

**Documents:** 04 Marketplace Service Description, 12 Platform Disclaimer, 01 Customer Terms.

**Decision:** ______ (reviewer, date)

## 2. Consumer grievance handling

**What the product does today**
- Every customer and provider can open a complaint from the job, or a general one.
- Complaints get a reference. The product default is acknowledgement within 24 hours and a resolution target of 15 days. The admin portal shows overdue items, and Reports shows the counts.
- Safety incidents are marked critical and alert all staff ([incident-escalation.md](../incident-escalation.md)).
- Staff can read a job conversation only through an audited function tied to a complaint.
- The Grievance Officer's name and contact are set per environment and shown on legal pages. **No officer is appointed yet.**

**Questions for counsel**
1. Which timelines apply: the Consumer Protection (E-Commerce) Rules, the IT Rules 2021, or both? Are 24 hours and 15 days the right defaults?
2. Must the Grievance Officer be resident in India and named publicly? What contact details are required?
3. What must the complainant be told at each step, and how long must records be kept?
4. Do business customers ("commercial purpose") have the same rights to redress? Should the policy treat them differently?

**Documents:** 08 Grievance and Complaint Policy, [completion-and-complaints.md](../completion-and-complaints.md).

**Decision:** ______

## 3. IT intermediary applicability

**What the product does today**
- Users publish profiles, photos, documents, chat messages, voice notes and suggestions.
- Staff review provider profiles and documents before approval; the catalogue is curated.
- There is an audit log of staff actions.
- There is **no dedicated takedown action yet**. Today staff can suspend an account or reject a profile.

**Questions for counsel**
1. Is the company an intermediary for user content, and does the section 79 safe harbour apply? Does pre-approving profiles affect that?
2. Which due-diligence duties apply: published rules, periodic user notices, takedown timelines, retention after takedown, cooperation with lawful requests?
3. What must the incident runbook contain for CERT-In reporting (Directions, 2022), and what log retention is required?
4. Are OTP-verified approvals with content fingerprints and timestamps adequate electronic evidence of a customer's approval?

**Documents:** 06 Acceptable Use Policy, 07 Prohibited Activities Policy, 05 Privacy Policy outline.

**Decision:** ______

## 4. DPDP privacy obligations

**What the product does today**
- Personal data: phone numbers, names, factory addresses and locations, provider identity and business documents, chat content, photos, voice notes, complaints.
- Data is stored in Supabase. The Mumbai region is planned and still to confirm.
- Row level security limits each record to the people involved. Identity documents are in private storage and readable only by the provider, its company admin (not for employees' identity documents) and staff. Automated tests check this ([security.md](../security.md)).
- Exact factory addresses are shown to a provider only after they accept a request.
- Contact sharing (phone / WhatsApp) needs consent from both sides.
- **Not built yet:** self-service data export, correction and erasure requests; scheduled retention and deletion; a consent-withdrawal screen.

**Questions for counsel**
1. Which DPDP Act and Rules obligations are in force on the launch date, and which come later?
2. For customer data shared with providers, and employee data entered by company admins: who is the data fiduciary, and who is a processor?
3. What notice and consent text is needed, in which languages, and at which step?
4. What retention period applies to each record type, given that approvals, estimates, complaints and audit records must be kept as evidence?
5. Which processor agreements are needed (database host, SMS, push notifications, error reporting)?
6. How should breaches be notified to the Data Protection Board and to users?

**Documents:** 05 Privacy Policy outline.

**Decision:** ______

## 5. Terms of use

**What the product does today:** users accept the current version of each applicable document at sign-up and when it changes. Acceptances are stored with the version, time and channel.

**Questions for counsel**
1. Are the limitation-of-liability and indemnity clauses fair and enforceable, including against small businesses?
2. Is click-wrap acceptance with OTP sign-in enough? Do material changes need re-acceptance, as the product does now?
3. Which law, courts and dispute-resolution route should apply?

**Documents:** 01 Customer Terms, 06, 07, 12.

**Decision:** ______

## 6. Provider agreements

**What the product does today**
- Technicians and companies accept their own terms.
- Companies invite their employees and stay responsible for them.
- Badges appear only for checks the platform actually recorded, such as "identity checked" or a reviewed certificate. They are not endorsements of work quality.

**Questions for counsel**
1. Does the relationship statement keep providers clearly independent? Which features could suggest employment or control?
2. Are providers "platform workers", and is the company an "aggregator", under the Code on Social Security, 2020 and any Telangana rules? What registration, data or contribution duties follow?
3. What should providers be required to hold (licences for regulated work, insurance), and what should only be recommended?
4. Is the badge wording accurate and not misleading?

**Documents:** 02 Technician Terms, 03 Service Company Terms, 11 Independent Provider Relationship Statement.

**Decision:** ______

## 7. Customer agreements

**What the product does today**
- Customers approve each estimate revision and each spare-part cost separately. The database lets only the customer who owns the request approve.
- The approval screen states who the provider is and that payment is arranged directly with the provider.

**Questions for counsel**
1. Does the estimate approval create a contract between the customer and the provider only? Is the wording clear about that?
2. Is the separate approval of spare parts, including parts the customer buys themselves, described adequately?
3. What should the customer be told about warranty, which comes from the provider or the manufacturer and not from the platform?

**Documents:** 01 Customer Terms, 09 Estimate and Approval Terms, 10 Spare-Parts Coordination Terms.

**Decision:** ______

## 8. Industrial safety language

**What the product does today**
- Before work starts, both sides confirm a site-safety checklist (access, isolation / lock-out, permits, protective equipment, site contact).
- Machines and categories that may need licensed work are flagged: electrical panels, boilers, pressure vessels, lifts.
- The platform does not give technical or safety instructions as its own advice. A copy guard blocks phrases that suggest the platform does the work.

**Questions for counsel**
1. Does the safety wording correctly leave occupier and employer duties with the customer and the provider (Factories Act / OSH Code as in force)?
2. For regulated work (electrical, boilers, pressure vessels, lifts), must a reviewed licence be in place before a provider can list that skill?
3. Is the incident procedure adequate, including preserving evidence and reporting to authorities?

**Documents:** 02, 03, 12, [incident-escalation.md](../incident-escalation.md).

**Decision:** ______

## 9. Tax and GST

**What the product does today:** it collects no consideration. Providers may enter their GSTIN and a tax line on their own estimates.

**Questions for the chartered accountant**
1. When must the company register for GST?
2. Do e-commerce operator TCS (CGST section 52) or section 9(5) apply while no payment passes through the platform? What would change if fees or payments were added later?
3. Does income-tax TDS under section 194-O apply?
4. Can providers show GST on estimates without the platform taking on any tax role?

**Decision:** ______

## 10. Business registration

**Questions for the founder, company secretary and counsel**
1. Entity type and incorporation; PAN, TAN and bank account.
2. Telangana Shops and Establishments registration.
3. Trademark search and filing for the platform name.
4. SMS sender ID and DLT template registration for sign-in codes and notifications.

**Decision:** ______

## 11. Insurance considerations

**Questions for the founder and an insurance broker**
1. Which platform covers are needed before launch: professional indemnity / technology errors and omissions, cyber, general liability?
2. Should providers be required or encouraged to hold public liability and employees' compensation cover? How should that be checked?
3. The insurance badge appears only after staff review a policy document and its expiry date. Is that wording appropriate?

**Decision:** ______

---

## Sign-off

| Area | Reviewer | Date | Outcome |
|---|---|---|---|
| 1–8 (legal) | | | |
| 9 (tax) | | | |
| 10–11 (business, insurance) | | | |

When every area is decided, update [README.md](README.md), [compliance-checklist.md](../compliance-checklist.md) and the `legal_documents` records. Until then, every document in this folder stays marked **DRAFT — LEGAL REVIEW REQUIRED**.
