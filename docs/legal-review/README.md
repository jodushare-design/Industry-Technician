# Legal Review Drafts

> **DRAFT — LEGAL REVIEW REQUIRED.** Every document in this folder is a structured template written by the product team. **None of it is legal advice**, and none has been reviewed by an Indian lawyer. Do not publish any of it to users until its status is `Approved`.

**Start here:** [legal-review-checklist.md](legal-review-checklist.md) groups the questions for counsel by area: e-commerce, grievances, intermediary rules, DPDP, terms, provider and customer agreements, safety, tax, registration and insurance.

## How to use these templates

- `[Square brackets]` mark placeholders or questions for counsel.
- **"Counsel notes"** sections list the points the product team needs a decision on.
- When a document is approved, record:
  - the reviewer, the date and the approved version in its header;
  - the same in the table below;
  - the same in the `legal_document` table (see [risk-control-design.md §1](../risk-control-design.md)).
- A production deploy is blocked until every document marked "Required at launch" is `Approved`.

## Status register

| # | Document | Required at launch | Legal review status | Reviewer | Date | Approved version |
|---|---|---|---|---|---|---|
| 01 | [Customer Terms of Use](01-customer-terms-of-use.md) | Yes | Not started | | | |
| 02 | [Technician Terms of Use](02-technician-terms-of-use.md) | Yes | Not started | | | |
| 03 | [Service Company Terms of Use](03-service-company-terms-of-use.md) | Yes | Not started | | | |
| 04 | [Marketplace Service Description](04-marketplace-service-description.md) | Yes | Not started | | | |
| 05 | [Privacy Policy outline](05-privacy-policy-outline.md) | Yes | Not started | | | |
| 06 | [Acceptable Use Policy](06-acceptable-use-policy.md) | Yes | Not started | | | |
| 07 | [Prohibited Activities Policy](07-prohibited-activities-policy.md) | Yes | Not started | | | |
| 08 | [Grievance and Complaint Policy](08-grievance-and-complaint-policy.md) | Yes | Not started | | | |
| 09 | [Service Estimate and Approval Terms](09-estimate-and-approval-terms.md) | Yes | Not started | | | |
| 10 | [Spare-Parts Coordination Terms](10-spare-parts-coordination-terms.md) | Yes | Not started | | | |
| 11 | [Independent Provider Relationship Statement](11-independent-provider-relationship-statement.md) | Yes | Not started | | | |
| 12 | [Platform Disclaimer](12-platform-disclaimer.md) | Yes | Not started | | | |

Allowed status values: `Not started` → `In review` → `Changes requested` → `Approved` (or `Withdrawn`).

## Concepts every document must stay consistent with

1. The platform facilitates discovery and communication.
2. Customers select service providers.
3. Providers independently determine diagnosis and repair methods.
4. Provider and customer directly agree on scope and charges.
5. The platform does not itself perform or supervise repairs.
6. Providers must hold applicable qualifications, licences and insurance where required.
7. Customers must give accurate machine information and arrange safe site access.
8. Providers must use appropriate competence, tools and work practices.
9. Additional work needs customer approval.
10. Spare-part compatibility must be confirmed by the responsible parties.
11. Complaints can be submitted through the platform.
12. The platform may suspend accounts for misconduct or policy violations.

**Do not** write any clause claiming the platform has no liability at all, or that a disclaimer removes every platform liability. The platform keeps real responsibilities, listed in [platform-responsibility-model.md §2](../platform-responsibility-model.md).
