# Platform Responsibility Model

> **DRAFT — LEGAL REVIEW REQUIRED.** This document maps responsibilities so the product can show them correctly. It is not a contract and does not limit anyone's legal liability. Legal review status: **Not started**.

**Status:** 2026-11-22
**Related:** [business-model.md](business-model.md), [user-journeys.md](user-journeys.md), [risk-control-design.md](risk-control-design.md)

## 1. The three parties

| Party | Relationship |
|---|---|
| **Customer** | Contracts the provider directly for the service |
| **Provider** (independent technician or service company) | An independent business. Not employed, dispatched or supervised by the platform. A company's employees are employed by that company. |
| **Platform** | Provides software services (discovery, catalogue, messaging, estimate/approval records, parts coordination records, complaint channel) to both customer and provider |

```
          Platform (technology services)
           /                         \
   Terms of Use                  Terms of Use
         /                             \
   Customer  ——— service agreement ———  Provider
             (scope, price, site, payment —
              agreed directly between them)
```

## 2. Responsibility by journey stage

**R** = responsible · **A** = agrees/approves · **I** = informed · **F** = platform facilitates with software only

| Stage | Customer | Provider | Platform |
|---|---|---|---|
| Accurate account and business details | R | R | F (OTP, document review where offered) |
| Machine information, photos, symptoms | R | I | F (catalogue, uploads) |
| Choosing which providers to contact | R | | F (search, "why this match") |
| Accepting or declining an invitation | | R | F |
| Technical assessment and diagnosis | I | R | — |
| Repair method, tools, competence | I | R | — |
| Scope, exclusions, price, validity | A | R (proposes) | F (estimate builder, version history) |
| Approving an estimate or revision | R | I | F (records approval, locks revision) |
| Additional work beyond approved scope | A (new approval) | R (must request) | F (status returns to awaiting approval) |
| Spare-part identification and specification | A | R | F |
| Spare-part compatibility | A | R (with supplier) | F (shows status; "Unknown" allowed) |
| Buying / arranging parts | R or — | R or — (whoever is "arranged by") | F (records only, no sale) |
| Site access, permits, lock-out/tag-out, safety arrangements | R (occupier of site) | R (own safe work practices) | F (reminder + acknowledgement record) |
| Qualifications, licences, insurance where required by law | | R | F (records what was reviewed, if any) |
| Doing the work | | R | — |
| Completion report | A (confirm or raise concern) | R | F |
| Payment | R (pays provider directly) | R (invoices, collects, taxes) | — (none in V1) |
| Complaints | R (raises) | R (responds, remedies) | R for running the channel: acknowledge, track, follow up, escalate, enforce platform policies |
| Accidents and serious damage | R (report; statutory reporting as site occupier) | R (report) | R for escalation procedure and preserving records |
| Platform availability, data security, privacy | | | R |
| Accuracy of platform-authored content (catalogue, badges, help text) | | | R |

The platform's own responsibilities (bottom rows and the complaint channel) are real. The product must not suggest it has none.

## 3. Where the UI must show the boundary

| Place | Text pattern (final wording after legal review) |
|---|---|
| Provider card / profile | "Independent service provider" or "Service company" + only the verification badges actually done, each with a date |
| Before contacting a provider | "You are contacting an independent provider. You and the provider agree on the work, price and payment directly." |
| Estimate header | "Estimate from *[provider name]*" |
| Approval screen | Approval statement — see [risk-control-design.md §4](risk-control-design.md) |
| Part with unknown compatibility | "Compatibility not confirmed. Check with the provider or supplier before buying." |
| Scheduling | "Agree site access, permits and safety arrangements with the provider before work starts." |
| WhatsApp hand-off | "Estimates and approvals made on WhatsApp are not recorded. Please approve in the app." |
| Completion screen | "This report was written by *[provider]*." |
| Complaint form | "We will acknowledge your complaint and follow up with both parties. We do not make technical findings about the repair." |
| Footer (web) | Links: Marketplace Service Description, Terms, Privacy, Grievance Officer |

## 4. Who may do what in the system

Enforced in the database (RLS and Postgres functions), not only in the UI.

| Action | Customer | Individual tech | Company admin | Company tech | Support | Platform admin |
|---|---|---|---|---|---|---|
| Create service request | ✔ own | | | | | |
| Invite providers to own request | ✔ | | | | suggest only | suggest only |
| Assign employee to job | | | ✔ own company | | | |
| Create / send estimate | | ✔ | ✔ | draft (send if granted) | ✗ | ✗ |
| Approve / reject estimate | ✔ own job | ✗ | ✗ | ✗ | ✗ | ✗ |
| Approve part cost | ✔ own job | ✗ | ✗ | ✗ | ✗ | ✗ |
| Mark provider status steps | | ✔ own job | ✔ | ✔ assigned | | |
| Confirm completion | ✔ own job | | | | | |
| Open complaint | ✔ | ✔ | ✔ | ✔ | on behalf (logged) | |
| Read conversation | participant | participant | participant | participant if assigned | only on complaint/abuse case, logged | same as support |
| Set verification statuses | | | | | | ✔ |
| Suspend account | | | | | recommend | ✔ |
| Delete complaints / approvals / audit | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |

Note: no one can approve an estimate on the customer's behalf, including admins. If a customer cannot use the app, the job continues off-platform and the record shows that no in-app approval exists.

## 5. Open questions for legal review

1. Does the platform qualify as a "marketplace e-commerce entity" and/or an "intermediary" for B2B industrial services, and which grievance timelines then apply?
2. Can providers be treated as "platform workers" under the Code on Social Security, 2020? If so, what are the aggregator contribution and registration duties?
3. For regulated work (electrical installations, boilers, pressure vessels, lifts/hoists), should the platform:
   - (a) only show regulatory reminders,
   - (b) require provider self-declarations, or
   - (c) require reviewed licences before a provider can list those skills?
4. How long should approvals, chats, complaints and incident evidence be kept under DPDP and limitation periods?
5. Is the platform's own liability cap/exclusion wording enforceable against small-business customers?
