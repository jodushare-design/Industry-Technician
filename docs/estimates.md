# Estimates and Customer Approval (Prompt 8)

**Code:**
- migration `supabase/migrations/20261122000600_estimates.sql`
- `packages/core/src/estimates.ts`
- `packages/api/src/estimates.ts`
- web: `/work/[id]/estimates` (provider builder) and `/requests/[id]/estimates/[revisionId]` (customer review and decision)

## Rules (enforced in the database)

| Rule | How |
|---|---|
| The provider prepares and sends | `save_estimate_draft` / `send_estimate_revision`. Only an **engaged** provider (accepted invitation) can do it: an individual, the company admin, or the assigned employee (drafts only, unless the company grants `can_send_estimates`). |
| Only the customer decides | `decide_estimate` checks `auth.uid()` is the request's customer. Providers, other customers, **support staff and platform admins are refused**. Revisions cannot be updated directly. |
| Exact revision, never an old price | Sending stores a **SHA-256 fingerprint** of the canonical content: all amounts, scope, exclusions, validity, notes, revision number, provider. The decision must carry the same fingerprint the customer was shown, so a stale screen, an older revision or a replaced revision is refused. |
| Every revision preserved | Revisions are numbered. A new revision **supersedes** the undecided one; it is not deleted. Only unsent drafts can be discarded. |
| Sent estimates frozen; accepted immutable | A trigger blocks any change to a sent revision's content, and **any** change at all to an accepted revision. An accepted estimate cannot be revised. |
| Additional work needs a new approval | Kind `additional_work`, allowed only after an approved estimate. Sending moves the job to *awaiting approval*. Rejecting it leaves the original approval in place (job back to *approved*). |
| Inspection-only | Kind `inspection`: needs an inspection fee, and cannot include labour or parts. The repair is quoted later as a separate estimate. |
| Validity | `valid_until` must be today or later when sent. Expired revisions cannot be accepted. `expire_estimates()` is for a daily schedule. |
| INR, decimal | `numeric(12,2)` columns, non-negative. `total` is a generated column (sum of the parts). TypeScript works in integer paise. |
| No payment | Nothing is collected. Screens say *"Payment is arranged directly with the provider."* |

**Effects of accepting:**
- the provider is selected for the request;
- other providers' open invitations become *not selected*, and their undecided estimates are superseded;
- the job moves to **approved**;
- a system message is posted, the provider is notified, and the decision is audited with the fingerprint.

**Status flow:** `discussion → estimate_sent → awaiting_approval → approved`. Rejections and change requests return to `discussion` (or to `approved` if an earlier estimate is already approved).

## Screens

**Provider builder:**
- choose inspection-only or repair (additional work once approved);
- the seven amount fields from the brief, a tax note and an other-charges note, with a **live total**;
- scope, exclusions, expected completion, valid-until, notes;
- **Save draft** or **Send to customer**;
- each estimate lists every revision with its status and the customer's note, with **Revise**, **Withdraw** and **Discard draft**.

**Customer review:**
- a line-by-line breakdown with **changes from the previous revision struck through**;
- scope and exclusions, validity, sent and decision times, and the fingerprint;
- the **approval statement** (independent provider, extra work needs separate approval, payment is direct) and a "I have read this estimate" checkbox;
- **Approve ₹X**, **Ask for changes** (note required) or **Reject**.

**Chat:** sending an estimate posts an estimate card in the conversation that links to the review page.

## Tests

`supabase/tests/estimates.test.ts` (11 tests) covers:
- engaged-provider-only drafting, and drafts hidden from customers;
- completeness checks;
- freezing, fingerprint and card on send;
- the customer-only decision (provider, other customer, support, admin and company admin all refused);
- change requests and revisions with supersession;
- old fingerprints and old revisions refused;
- acceptance locks the revision, selects the provider and closes the others;
- providers who were not selected are blocked;
- additional work and rejection;
- inspection-only rules;
- the employee send permission;
- expiry.

**Bug found and fixed:** `can_act_for_provider_on_request` returned NULL instead of false when no employee was assigned, so an unrelated customer was not refused. It now uses `coalesce`. The rule is recorded in `CLAUDE.md`.
