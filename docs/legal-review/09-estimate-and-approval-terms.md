# Service Estimate and Approval Terms

> **DRAFT — LEGAL REVIEW REQUIRED** — not legal advice; not for publication.

| Field | Value |
|---|---|
| Document code | `estimate_terms` |
| Draft version | 0.1 (2026-11-22) |
| Applies to | Customers and providers using estimates |
| Legal review status | **Not started** |
| Reviewer / date / approved version | — |

## Template outline

1. **Who writes the estimate.**
   - Only the provider prepares and sends estimates.
   - The platform supplies the form and records it. It does not set, check or recommend prices.

2. **Contents.** An estimate states, in INR:
   - inspection fee, visit charge, labour, travel, parts, other charges;
   - applicable tax and total;
   - scope;
   - exclusions;
   - expected completion;
   - validity date.

3. **Inspection-only estimates.** A provider may send an estimate for inspection only, e.g. "Inspection fee ₹500. Repair price to be quoted after inspection." Approving it approves only the inspection.

4. **Customer decisions.**
   - The customer may accept, reject or request a revision.
   - **Only an explicit in-app action by the customer counts as acceptance.**
   - Silence, chat messages, phone calls or WhatsApp messages are not recorded as approval on the platform.

5. **Revisions.**
   - Every revision is kept.
   - A revised estimate is not accepted until the customer accepts that revision.

6. **Accepted estimates.**
   - An accepted revision cannot be changed.
   - Additional work, changed scope or a price increase needs a new revision or estimate, and a new approval.

7. **Expiry.** An estimate cannot be accepted after its validity date. The provider may re-issue it.

8. **Parts.** Part costs approved through parts coordination are recorded separately and are not added to an accepted estimate automatically.

9. **Agreement between the parties.**
   - The accepted estimate records what the customer and provider agreed through the platform.
   - [Counsel: is the accepted estimate the service contract itself, or evidence of it? Which terms prevail if the provider has its own terms?]

10. **Payment.**
    - Arranged directly between customer and provider.
    - The platform does not collect payment [in V1].
    - Invoicing and GST are the provider's responsibility.

11. **Records.**
    - The platform keeps estimates, revisions and decisions with timestamps and a tamper-evident fingerprint.
    - Both parties can view and export them.

## Counsel notes

- The evidential value of the approval record: hash, timestamp, OTP-authenticated session.
- Should acceptance require re-entering an OTP for amounts above a threshold?
