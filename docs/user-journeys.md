# User Journeys

**Status:** Draft for product review — 2026-11-22
**Related:** [business-model.md](business-model.md), [platform-responsibility-model.md](platform-responsibility-model.md), [risk-control-design.md](risk-control-design.md)

How to read this document:
- Each journey step lists the **screen**, the **record** the platform creates, and any **boundary note**. A boundary note is where the user interface (UI) must make clear that the provider, not the platform, does the work.
- Statuses refer to the job state machine (Prompt 10). Defined below in §7.

## 1. User groups

| # | Group | Role code | Signs in on | Main goal |
|---|---|---|---|---|
| 1 | Industrial customer | `customer` | Web, Android | Find a provider for a machine problem and keep a record of what was agreed |
| 2 | Independent technician | `technician` | Android (primary), web | Receive relevant requests, quote, do the work they contract for |
| 3 | Service company | `company_admin` | Web (primary), Android | Receive requests, assign their own employees, quote |
| 4 | Company employee / technician | `company_technician` | Android | Work jobs their company assigns to them |
| 5 | Platform administrator | `platform_admin`, `support_agent` | Admin portal (web) | Verify accounts, run the catalogue, handle complaints |

One person can hold more than one role. For example, a technician who is also a customer for their own workshop. Roles are separate rows, never one merged account type.

---

## 2. Customer journey

| # | Step | Screen | Record created | Boundary note |
|---|---|---|---|---|
| 1 | Register | Phone → OTP → name, factory name, location, optional email | `profile`, `customer_account`, `factory`, `terms_acceptance` | Accepts Customer Terms + Marketplace Service Description (versioned) |
| 2 | Search or select machine | Catalogue search with aliases; "I don't know the machine name" option; save to *My machines* | `customer_machine` (links to catalogue machine type, optional make/model) | Catalogue is reference information, not a compatibility claim |
| 3 | Describe problem | Symptom picker (machine stopped, unusual noise, vibration, overheating, low output, electrical fault, automation fault, regular service, installation, other) + free text + urgency | `service_request` (status `submitted`) | Labelled **"What you are seeing"**, never "diagnosis" |
| 4 | Upload media | Photo, short video, voice note; retry on poor network | `request_attachment` (private storage) | Customer warned not to upload ID documents or third-party personal data |
| 5 | Search technicians | Ranked provider list with a **"Why this match"** line (machine skill, distance, availability, which verifications were done) | `match_result` snapshot (for analytics and dispute evidence) | Shows "Independent service provider" on every card; badges only for verifications actually done |
| 6 | Select provider(s) | Contact one or several providers | `request_invitation` per provider; status → `provider_contacted` | The customer chooses. Platform makes no "best for you" guarantee. |
| 7 | Chat | Job-linked in-app chat | `conversation`, `message` | In-app chat is the official record. WhatsApp hand-off is optional, needs consent from both parties, and shows a reminder. |
| 8 | Receive estimate | Estimate card in chat → full estimate view | `estimate`, `estimate_revision` (status `estimate_sent` → `awaiting_approval`) | Header: "Estimate from *[provider]*, an independent service provider" |
| 9 | Approve / reject / request revision | Approval screen showing exact revision, total in INR, scope, exclusions, validity | `estimate_decision` (actor = customer, timestamp, revision hash) | Approval statement (see risk-control §4). Approval locks that revision. |
| 10 | Coordinate parts | Parts list in job; approve or reject each part cost | `part_request`, `part_status_event`, `part_decision` | Compatibility shown as stated by provider/supplier, including "Unknown" |
| 11 | Arrange service | Agree date, site access, safety arrangements with provider | `job_schedule`, `site_safety_ack` (both parties) | "Site access and safety arrangements are agreed between you and the provider" |
| 12 | Confirm completion or report problem | Review completion report → Confirm / Raise a concern / Open complaint | `completion_confirmation` or `complaint` | Platform records the outcome. It does not judge technical quality. |

**Alternative paths**
- **Inspection-only.** The provider sends an inspection estimate (e.g. "Inspection fee ₹500. Repair price to be quoted after inspection"). The customer approves it. After inspection, a new repair estimate needs a new approval.
- **Additional work found on site.** The provider sends a revision or a new estimate. The status goes back to `awaiting_approval`. Work beyond what was approved must not be recorded as approved.
- **Cancel.** The customer can cancel any time before `work_in_progress`. After that, cancelling asks for a reason, and both parties see it.
- **No providers found.** The request stays in `finding_providers`. The customer can widen the search radius or ask support to help search (support can suggest providers, never assign them).

## 3. Independent technician journey

| # | Step | Screen | Record created | Boundary note |
|---|---|---|---|---|
| 1 | Register | Phone → OTP → name | `profile`, `provider_account (type=individual)`, `terms_acceptance` | Accepts Technician Terms + Independent Provider Relationship Statement |
| 2 | Create profile | Photo, languages, short bio | `provider_profile` | Profile copy checked against banned-wording list |
| 3 | Select machine expertise | Catalogue picker | `provider_skill` (one row **per machine type**) | |
| 4 | Add experience | Years + level for each skill; optional manufacturer/model experience | `provider_skill.years`, `provider_skill_make_model` | Self-declared; labelled "Experience (stated by provider)" |
| 5 | Service locations | Pin + travel radius, or list of areas | `service_area` | |
| 6 | Optional proof | Certificates, licences (e.g. electrical), insurance, work photos | `provider_document` (private) → `verification_check` | A badge appears only after admin review of that specific document |
| 7 | Receive requests | Inbox of invitations matched to skills/area | `request_invitation` read receipt | Provider may decline without penalty |
| 8 | Review machine info | Request detail: machine, symptoms, media, location (area only until accepted) | | Exact address shown only after the customer engages the provider |
| 9 | Chat and ask questions | Job chat | `message` | |
| 10 | Send estimate | Estimate builder: inspection fee, visit, labour, travel, parts, other, tax, scope, exclusions, completion date, validity | `estimate_revision` (draft → sent) | Provider authors scope and method. Platform only checks form fields. |
| 11 | Receive approval | Notification + locked estimate view | | Provider cannot mark an estimate as approved |
| 12 | Coordinate parts | Add part requests; update supplier, price, availability | `part_request` | Must set compatibility status; "Unknown" is allowed |
| 13 | Perform the service | Status updates: scheduled → travelling → arrived → work in progress → waiting for parts | `job_status_event` | Provider performs the work as an independent contractor of the customer |
| 14 | Completion report | Fault identified, work done, parts used, before/after photos, remaining issue, recommendations, date | `completion_report` | "Fault identified" is the **provider's** finding, labelled as such |

## 4. Service company journey

| # | Step | Screen | Record created | Boundary note |
|---|---|---|---|---|
| 1 | Register company | Admin user phone/OTP → company name | `provider_account (type=company)`, `company_member (role=admin)`, `terms_acceptance` | Accepts Service Company Terms + Independent Provider Relationship Statement |
| 2 | Company information | Business contact, address, GSTIN (optional), registration docs | `company_profile`, `provider_document` | Docs private; "Business details reviewed" badge only after review |
| 3 | Service categories | Catalogue categories | `company_category` | |
| 4 | Machine expertise | Company-level machine types | `company_skill` | Company skill describes the company. **It is not copied to employees.** |
| 5 | Add employees | Invite by phone; employee completes OTP | `company_member (role=technician)` | The company, not the platform, is the employer |
| 6 | Employee skills | Per-employee machine skills and experience | `provider_skill` (owner = employee, company_id set) | Must be set per person. The UI offers "copy from company" as an explicit, per-skill choice. |
| 7 | Receive requests | Company inbox | `request_invitation` | |
| 8 | Assign employee | Pick employee; matching shows that employee's skills | `job_assignment` | Assignment is the company's decision |
| 9 | Communicate | Chat; company admin and assigned employee are both participants | `conversation_participant` | |
| 10 | Send estimates | Same builder as technicians; sent in the company's name | `estimate_revision (author_company)` | |
| 11 | Coordinate parts | As technician | `part_request` | |
| 12 | Record completion | Assigned employee or admin submits completion report | `completion_report` | |

## 5. Company employee journey

1. **Accept invite.** Gets an SMS invite, verifies by OTP, and is linked to the company.
2. **Complete own profile.** Adds their own skills and experience (or accepts skills the company admin proposed), languages and documents.
3. **See assigned jobs.** Sees only jobs assigned to them. Other company jobs are visible only if the company admin grants it.
4. **Work the job.** Chats, updates status, drafts estimates. Sending an estimate is allowed only if the company admin grants that permission (default: draft only, admin sends).
5. **Submit the completion report.**
6. **Leave the company.** Employee or admin ends the membership. Job history stays with the company. The person keeps their own profile.

## 6. Platform administrator journey

| Area | Actions | Boundary note |
|---|---|---|
| Verification | Review documents; set each check (mobile, identity, business, certificate + validity) separately; approve / reject / suspend accounts | Records what was reviewed and when. Never "certifies" skill. |
| Catalogue | Import CSV/JSON, dedupe, merge, approve, manage aliases, review user suggestions | No invented models; every record has a source and confidence |
| Requests | View requests (audit-logged); help customers widen a search | Can suggest providers. Cannot assign providers or create estimates. |
| Complaints | Acknowledge, assign support person, contact parties, record resolution, escalate incidents | Facilitates and follows up; makes no technical fault findings |
| Accounts | Suspend for policy violations, with reason and notice | Suspension never deletes complaints, approvals or audit records |
| Reports | Usage, response times, complaint SLA, search analytics | |

## 7. Job states (summary — full rules in Prompt 10)

```
submitted → finding_providers → provider_contacted → discussion
  → estimate_sent → awaiting_approval → approved → scheduled
  → provider_travelling → provider_arrived → work_in_progress
  ⇄ waiting_for_parts
  → work_completed → customer_confirmation_pending → closed

(any open state) → cancelled
(work_in_progress onward) → disputed → closed
approved / work_in_progress → awaiting_approval   (revision or additional work)
```

Who moves each step:

| Transition | Actor |
|---|---|
| Customer-only: approve, confirm, cancel, dispute | `customer` |
| Provider-only: estimate sent, travelling, arrived, work in progress, waiting for parts, work completed | provider |
| Admin: closing a `disputed` job (after recording the resolution), force-cancel abusive jobs | `support_agent`, `platform_admin` |

## 8. Notifications per journey (V1)

| Event | Customer | Provider | Channel |
|---|---|---|---|
| New request invitation | | ✔ | Push + in-app |
| New message | ✔ | ✔ | Push + in-app |
| Estimate sent / revised | ✔ | | Push + in-app |
| Estimate accepted / rejected / revision requested | | ✔ | Push + in-app |
| Part needs approval | ✔ | | Push + in-app |
| Completion report submitted | ✔ | | Push + in-app |
| Complaint acknowledged / updated | ✔ | ✔ (if party) | Push + in-app + SMS (acknowledgement only) |

All notification text follows the wording rules in [business-model.md §5](business-model.md).
