# Job Progress, Completion and Complaints (Prompt 10)

**Code:**
- migration `supabase/migrations/20261122000800_completion_complaints.sql`
- `packages/core/src/complaints.ts`
- `packages/api/src/completion.ts`
- web: `/work/[id]/job`, `/requests/[id]/job`, `/complaints`
- admin: `/complaints`

## Job status (all 17 from the brief)

```
submitted → finding_providers → provider_contacted → discussion → estimate_sent → awaiting_approval → approved
approved → scheduled | provider_travelling | provider_arrived | work_in_progress
scheduled → provider_travelling → provider_arrived → work_in_progress ⇄ waiting_for_parts
work_in_progress → work_completed → customer_confirmation_pending → closed
(open states) → cancelled        work_in_progress / customer_confirmation_pending → disputed → closed (staff)
approved / scheduled / in progress / waiting for parts → awaiting_approval (additional work)
```

Every change goes through `private.change_job_status`, which checks the matrix above and records an append-only status event.

| Who | Can do |
|---|---|
| Customer | contact providers, accept estimates, cancel (before work starts), confirm completion, report a concern (→ disputed) |
| Selected provider (person, company admin or assigned employee) | schedule; travelling, arrived, work in progress, waiting for parts; submit the completion report (→ work completed → waiting for the customer) |
| Staff | close a **disputed** job, only after a linked complaint is resolved |

**Site safety:** both sides tick the five-item checklist:
- access;
- isolation / lock-out;
- permits;
- PPE;
- site contact.

Work **cannot start** until the provider has confirmed it. The customer's confirmation is recorded and shown.

## Completion report

Written by the provider:
- fault they identified;
- work performed;
- parts installed (listed automatically from parts in the *installed* stage) and notes;
- remaining issue;
- recommendations;
- completion date;
- before and after photos (private `job-photos` bucket).

The report is **fingerprinted and immutable**. The screen says it is the provider's record and that the platform does not inspect or certify the work.

**Customer response:**
- **Confirm**, with an optional 1–5 rating and comment. Feedback is private to the platform and not shown to providers or the public in V1.
- Or **Report a concern**, which disputes the job and opens a complaint.

## Complaints

| Item | Design |
|---|---|
| Form | Job (optional), category (10, including safety incident), description, then files (photos, video, audio, PDF up to 50 MB) |
| Reference | `CMP-YYMM-nnnnn`, plus the job reference |
| Parties | The complainant, the job's customer and the provider named in the complaint. Staff see everything. |
| Timeline | Append-only events: created, acknowledged, assigned, message, **internal note (staff only)**, status, escalated, resolved, reopened, conversation viewed, attachment |
| Deadlines | Acknowledge within **24 hours**; resolution target **15 days** (the stricter of the regimes that may apply, pending counsel). Overdue complaints are flagged in the admin list. |
| Status | open → acknowledged → in progress → resolved → closed (reopen from resolved) |
| Resolution | Category plus notes on **how it was handled**: resolved between parties, provider action, account action, referred to authorities, no action needed, withdrawn. Never a technical verdict. |
| Assigned support person | `assigned_to` (assign to me / to another staff member) |
| Evidence | Complaints, events and attachments **cannot be deleted or edited by anyone**, including after an account is suspended or closed |
| Staff access to chats | Only `staff_read_conversation(complaint, conversation)`, for conversations of that complaint's job. Each view is logged on the complaint and in the audit log. |
| Safety incidents | Critical and escalated automatically; all staff notified; emergency guidance shown. See [incident-escalation.md](incident-escalation.md). |

## Tests

`supabase/tests/completion.test.ts` (15 tests) covers:
- only the selected provider schedules and updates progress;
- safety checklist required (every item);
- job photo privacy;
- an immutable, fingerprinted report;
- customer-only confirmation, with feedback hidden from providers;
- concern → dispute + complaint with 24 h / 15 d deadlines;
- complaint parties;
- staff handling, with internal notes hidden from parties;
- conversation access only through the complaint, audited;
- a disputed job closes only after the complaint is resolved;
- safety incidents escalated to all staff;
- nothing deletable after suspension.

**Change found while testing:** an approved job had to be formally scheduled before work could start. That doesn't fit urgent same-day breakdowns, so `approved` can now go straight to travelling, arrived or work in progress.
