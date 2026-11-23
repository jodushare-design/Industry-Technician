# Business-Model Boundary

> **DRAFT — LEGAL REVIEW REQUIRED.** This is a product and engineering boundary document, not legal advice. Contract wording comes later in `docs/legal-review/`. Legal review status: **Not started**.

**Last updated:** 2026-11-22
**Applies to:** website, Android app, admin portal, database, notifications and all user-facing text.

## 1. What we are

We are a **technology marketplace provider** for Hyderabad, India. We run a digital platform that helps industrial customers discover and communicate with **independent technicians** and **industrial service companies** ("providers").

## 2. What the platform does (V1)

| Capability | What it means in the product |
|---|---|
| Digital platform | Website, Android app, accounts, profiles |
| Discovery | Search and match providers by machine expertise, location, availability and verification status |
| Shared machine catalogue | One reference catalogue of industries, machines, manufacturers, models and parts, with sources |
| In-app messaging | Job-linked chat with attachments. This is the official record of the conversation. |
| Estimate exchange | Providers write and send estimates. Customers accept, reject or ask for a revision. Every version is kept. |
| Approval records | Timestamped, tamper-evident record of what the customer approved and when |
| Spare-parts coordination | A shared checklist for parts (identification, compatibility status, supplier, price, customer approval) |
| Complaint and support channel | Complaint intake, tracking, follow-up and escalation |

## 3. What the platform does NOT do

| The platform does not… | Product consequence |
|---|---|
| Employ or dispatch its own technicians | No "assign technician" action for platform staff. Customers choose; companies assign their own employees. |
| Diagnose machine faults | No platform-generated diagnosis. Fault pickers are customer descriptions ("symptoms"), not findings. |
| Perform or supervise repairs | No platform work orders, supervision or sign-off on technical quality |
| Guarantee quality or outcomes | No warranty, guarantee, "assured" or "certified repair" wording anywhere |
| Manufacture or sell machinery | Catalogue is reference only. No product listings or prices from the platform. |
| Buy or sell spare parts (V1) | No cart, checkout, inventory or supplier commission. Supplier details are information only. |
| Control providers' technical decisions | Provider writes scope, method and exclusions. The platform only validates form fields. |
| Collect repair payments (V1) | **No payment tables, gateway or wallet in V1.** Customer and provider settle payment directly. |
| Take a repair commission (V1) | No commission fields on jobs or estimates |

## 4. Who is responsible for what

| Topic | Customer | Provider | Platform |
|---|---|---|---|
| Choosing the provider | ✔ | | Shows information to help choose |
| Accurate machine and site information | ✔ | | |
| Technical assessment, diagnosis, method | | ✔ | |
| Scope and price | Agrees | Proposes | Records |
| Additional work | Must approve again | Must request again | Enforces "new approval needed" |
| Spare-part compatibility | Confirms with provider/supplier | Confirms | Shows status, including "unknown" |
| Site access and safety arrangements | ✔ (agreed with provider) | ✔ (agreed with customer) | Reminds both parties |
| Qualifications, licences, insurance | | ✔ (where required) | Records only what it has actually reviewed |
| Payment | ✔ (directly to provider) | ✔ | Not involved in V1 |
| Complaints | Raises | Responds | Receives, tracks, follows up, may suspend accounts for policy breaches |

The platform **does not claim to have no liability**. Its legal obligations (consumer protection, intermediary, data protection) are mapped in `docs/compliance-checklist.md` (Prompt 2).

## 5. Language rules

**Never use:**
- "Our technicians", "our engineers", "our repair team"
- "We will repair your machine", "we fix", "we service"
- "Guaranteed repair", "assured quality", "certified repair"
- "Verified expert" or "certified" — unless that specific verification was actually done (see §6)

**Use instead:**
- "Find a technician"
- "Independent service provider"
- "Service company"
- "Contact provider"
- "Provider estimate"
- "Customer approval"
- "Raise a concern"

**Enforcement.** Phase 2 adds a copy lint (a CI check over UI strings and notification templates) that fails the build on the banned phrases.

## 6. Verification wording

Each verification is shown as a separate, factual, dated badge. There is no single "verified" flag.

| Badge | Shown only when |
|---|---|
| Mobile verified | OTP completed |
| Identity checked | Admin reviewed an ID document (the document itself is never shown to customers) |
| Business details reviewed | Admin reviewed business registration or GST details |
| Certificate reviewed: *name, valid until date* | Admin reviewed that certificate and its validity date |

Statuses **Approved / Rejected / Suspended** are account states, not quality claims.

## 7. Data-model consequences

- **Roles:** `customer`, `technician`, `company_admin`, `company_technician`, `platform_admin`, `support_agent`.
- **Write rights:**
  - `estimate.author` is always a provider.
  - `estimate_approval.actor` is always the job's customer. This is enforced in a Postgres function and RLS.
- **No V1 tables for:** payments, wallets, commissions, orders, inventory or platform-assigned technicians.
- **Parts:** rows carry `arranged_by` (customer or provider) and a `compatibility_status` that includes `unknown`. Part costs never change an accepted estimate on their own.
- **Records that survive suspension:** complaints, approvals and audit logs are kept when an account is suspended or closed, subject to the retention policy agreed in legal review.

## 8. Future changes that require revisiting this document

Any of these changes the business model and needs legal and tax review **before** design work starts:

- Payment collection
- Escrow
- Commission
- Platform-sold parts
- Platform-employed technicians
- Warranties
- WhatsApp Business API

## 9. Review

| Reviewer | Role | Date | Status |
|---|---|---|---|
| | Founder / product owner | | Pending |
| | Legal counsel (India) | | Pending |
