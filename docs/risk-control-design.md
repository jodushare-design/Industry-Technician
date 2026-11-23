# Risk-Control Feature Design (Prompt 2)

**Status:** Draft for product + legal review — 2026-11-22

This document lists the software features that make the marketplace operating model real. Each feature lists the risk it controls, how it works, and the phase that builds it. Final wording for every user-facing statement comes from the legal-review drafts in [`legal-review/`](legal-review/).

## 1. Versioned terms and consent records

| | |
|---|---|
| **Risk** | Not being able to show which terms a user agreed to, or consent obtained through pre-ticked boxes |
| **Design** | `legal_document (code, version, effective_from, review_status, body_hash)`<br>`terms_acceptance (user_id, document_code, version, accepted_at, ip, app_version, channel)`<br>Unticked checkboxes. One checkbox per document set per role.<br>When a document changes materially, users must accept again before their next important action (send estimate / approve estimate). |
| **Rules** | Documents whose `review_status` is not `approved` show a visible **DRAFT** banner in non-production builds. Production deploy is blocked unless all required documents are `approved` (CI check). |
| **Phase** | 3 (schema), 5 (onboarding UI) |

## 2. Wording enforcement (no "our technicians")

| | |
|---|---|
| **Risk** | UI copy implies the platform is the repair contractor or guarantor |
| **Design** | All UI strings and notification templates live in message catalogues (`packages/core/i18n`). A CI lint (`copy-lint`) fails the build on banned patterns:<br>`our (technician|engineer|repair team)`, `we (will )?(repair|fix|service)`, `guarantee`, `assured`, `certified` (allowed only inside the approved certificate-badge template).<br>Provider profile text is checked by the same rules at save time. Matches are flagged for admin review, not silently blocked. |
| **Phase** | 3 |

## 3. Factual verification badges

| | |
|---|---|
| **Risk** | Customers read a badge as a platform endorsement or certification |
| **Design** | `verification_check (subject_id, kind, status, reviewed_by, reviewed_at, valid_until, evidence_document_id)` with kinds `mobile`, `identity`, `business`, `certificate:<name>`, `licence:<type>`, `insurance`.<br>Badges are generated only from `status = passed` rows. Each badge shows its date. Expired items disappear automatically.<br>Badge tooltip: "Reviewed by the platform on *date*. This is not a guarantee of work quality." |
| **Phase** | 5 |

## 4. Estimate approval statement and locking

| | |
|---|---|
| **Risk** | Disputes over what was agreed. Providers treating a revised price as accepted. |
| **Design** | Approval is a Postgres function `approve_estimate(revision_id)`. It checks:<br>• `auth.uid()` is the job's customer<br>• the revision is the latest sent one<br>• the revision is not expired<br>It then stores a SHA-256 of the canonical revision JSON with the decision. A trigger makes approved revisions immutable.<br>Additional work → new revision → job returns to `awaiting_approval`. |
| **Statement shown above the Approve button (draft)** | "You are approving revision *n* from *[provider]* for ₹*total*. *[Provider]* is an independent service provider. They are responsible for the work described. Any extra work or parts need your separate approval. Payment is arranged directly with the provider." |
| **Phase** | 8 |

## 5. Parts-cost separation

| | |
|---|---|
| **Risk** | Part costs silently added to an accepted estimate. Unverified compatibility treated as fact. |
| **Design** | Parts are separate `part_request` rows with their own `part_decision`. They are never merged into an approved estimate total. The job view shows "Approved estimate" and "Approved parts" as separate subtotals.<br>`compatibility_status` is one of `confirmed_by_provider`, `confirmed_by_supplier`, `unknown`, `not_compatible`. It defaults to `unknown`, and `unknown` shows a warning before approval. |
| **Phase** | 9 |

## 6. Site safety acknowledgement

| | |
|---|---|
| **Risk** | Unsafe site work. Unclear who arranged isolation, permits and PPE. |
| **Design** | When a job is scheduled, both parties tick a short checklist. The tick records that the item was **discussed**; it is not a safety certification. Items:<br>• access and timing<br>• isolation / lock-out-tag-out arranged by site<br>• permits (hot work, confined space, height) if needed<br>• PPE<br>• site contact person<br>Stored in `site_safety_ack (job_id, party, items jsonb, acknowledged_at)`. |
| **Phase** | 10 |

## 7. Regulated-work flag

| | |
|---|---|
| **Risk** | Platform lists providers for work that by law needs a licensed or approved person, without any warning. Examples: electrical installation work, boiler repairs, pressure vessels, lifts/hoists. |
| **Design** | Catalogue machine types and service skills carry `regulated_work: {kind, note}`.<br>When a customer creates a request for a flagged item, they see a reminder to check the provider holds the required licence or approval.<br>A provider who adds a flagged skill must make a self-declaration. If they upload a licence and admin reviews it, a licence badge appears.<br>Whether listing a flagged skill **requires** a reviewed licence is an open legal question (responsibility model §5 Q3). Default V1: declaration + reminder. |
| **Phase** | 4 (catalogue field), 5–6 (UI) |

## 8. Contact-detail protection and off-platform hand-off

| | |
|---|---|
| **Risk** | Phone numbers harvested. Approvals made on WhatsApp with no record. |
| **Design** | Phone numbers are masked until both parties consent through `contact_share_consent (job_id, party, granted_at, revoked_at)`.<br>The WhatsApp button appears only after both have consented. It opens `wa.me` with no job data prefilled unless the user chooses to include it.<br>A reminder banner is shown each time. No WhatsApp Business API in V1. |
| **Phase** | 7 |

## 9. Complaint channel and grievance timelines

| | |
|---|---|
| **Risk** | Missing legally required grievance timelines. Complaints lost. Evidence deleted. |
| **Design** | `complaint (id, job_id, raised_by, category, description, status, assigned_to, ack_due_at, resolve_due_at)` plus `complaint_event` (append-only) and private attachments.<br>SLA timers are set to the **strictest** timelines that may apply, until counsel confirms which apply (see [compliance-checklist.md](compliance-checklist.md)): acknowledge ≤ 24 h, resolution target ≤ 15 days. Timers are configurable.<br>Grievance Officer name and contact are shown in the app and on the website (from settings).<br>Categories: no-show, delay, price dispute, work quality concern, parts issue, conduct/harassment, safety incident, data/privacy, platform/app issue, other. |
| **Phase** | 10 |

## 10. Incident escalation

| | |
|---|---|
| **Risk** | Accidents or serious equipment damage handled like ordinary complaints |
| **Design** | Category `safety_incident` or keywords (injury, fire, electric shock, explosion, gas) trigger the incident path:<br>1. Immediate on-screen advice to contact emergency services (112) and the site's safety officer.<br>2. Page the on-call admin.<br>3. Evidence hold (attachments and chats locked from deletion).<br>4. Both accounts flagged for review.<br>5. Admin records follow-up actions.<br>The platform does not investigate technical cause. It preserves records and co-operates with authorities. The procedure document is written in Prompt 10. |
| **Phase** | 10 |

## 11. Suspension without evidence loss

| | |
|---|---|
| **Risk** | A user deletes or suspends their account to erase evidence. Over-retention under DPDP. |
| **Design** | `account_status` values: `active`, `suspended`, `closed`.<br>Closing an account de-identifies the profile, but keeps complaints, approvals, estimates, completion reports and audit logs under a `legal_hold` / retention schedule. DPDP erasure requests are handled against that schedule (retention periods to be set by counsel). |
| **Phase** | 5 (status), 11 (retention jobs) |

## 12. Audit log

| | |
|---|---|
| **Risk** | Disputed actions with no trustworthy trail |
| **Design** | `audit_log` is append-only: insert-only grants, no update or delete for any role. Database triggers write entries for:<br>• estimate send / decision<br>• part decisions<br>• status changes<br>• verification changes<br>• suspensions<br>• admin reads of private conversations or documents |
| **Phase** | 3 (table), each phase adds its events |

## 13. No-payment guarantee (V1)

| | |
|---|---|
| **Risk** | Accidentally becoming a payment intermediary, which brings payment-system, tax-collection-at-source (TCS) and escrow obligations |
| **Design** | No payment, wallet, payout or commission tables. A CI check fails if payment SDKs are added (Razorpay, Stripe, PayU, Cashfree, etc.).<br>Estimate screens say "Payment is arranged directly with the provider". |
| **Phase** | 3 |
