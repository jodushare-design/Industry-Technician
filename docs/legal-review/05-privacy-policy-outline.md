# Privacy Policy — Outline

> **DRAFT — LEGAL REVIEW REQUIRED** — not legal advice; not for publication.

| Field | Value |
|---|---|
| Document code | `privacy_policy` |
| Draft version | 0.1 (2026-11-22) |
| Applies to | All users and visitors |
| Legal review status | **Not started** |
| Reviewer / date / approved version | — |

## Outline (aligned to the Digital Personal Data Protection Act, 2023 and its Rules — counsel to confirm which obligations are in force on the launch date)

1. **Data fiduciary identity and contact.** [Entity, address. Grievance Officer / contact for data-protection queries. DPO if Significant Data Fiduciary — unlikely; confirm.]

2. **Personal data we process.**

   | Category | Examples | Who |
   |---|---|---|
   | Account | name, mobile, email, role | all |
   | Business | factory name, address/location, GSTIN | customers, companies |
   | Provider profile | skills, experience, languages, service area, photos | providers |
   | Verification documents | ID, certificates, licences, business documents | providers (private) |
   | Job content | machine details, problem descriptions, photos, videos, voice notes | customers, providers |
   | Messages | chat text and attachments | participants |
   | Records | estimates, approvals, parts decisions, completion reports, complaints | parties |
   | Technical | device, app version, IP, logs, approximate location for matching | all |

3. **Purposes and legal basis.** For each purpose, state either consent or a "legitimate use" under the DPDP Act. Purposes:
   - running accounts;
   - matching;
   - messaging;
   - keeping records of estimates and approvals;
   - complaints and safety incidents;
   - verification;
   - fraud prevention;
   - legal compliance;
   - service improvement (search analytics).

4. **Notice and consent.**
   - Itemised notice at collection.
   - Consent that can be withdrawn as easily as it was given.
   - [Consent manager — not planned.]

5. **Sharing.**
   - Between customer and the providers they contact. Phone numbers only after both parties consent.
   - Processors:
     - Supabase (hosting/database/storage) — [region];
     - SMS/OTP provider;
     - push notifications (Google FCM / Expo);
     - error logging (Sentry);
     - email.
   - Authorities when legally required.
   - **No sale of personal data.**

6. **Cross-border transfer.** [Name the hosting regions. Confirm no restricted countries.]

7. **Retention.**
   - Per category. Complaints, approvals and audit records are kept for [x years — limitation period] even after account closure.
   - Verification documents are deleted [x months] after rejection or account closure, unless needed for a dispute.

8. **Security safeguards.**
   - Encryption in transit and at rest.
   - Row-level access controls.
   - Private storage with short-lived links.
   - Audit logs.
   - Breach response.

9. **Personal data breach.** Notify the Data Protection Board and affected users as the Rules require.

10. **Your rights.** Access, correction, completion, erasure (subject to retention), grievance redressal, nomination. How to exercise them and the response timelines.

11. **Children.** Service not intended for under-18s. No knowing processing of children's data.

12. **WhatsApp hand-off.** Only after both parties consent. Once data is on WhatsApp, Meta's terms apply. The platform does not receive or process those chats.

13. **Changes to this policy.**

## Counsel notes

- Confirm how the DPDP Rules are being phased in. Plan the launch against the obligations that will be in force.
- Who is data fiduciary for customer data passed to providers?
- Retention periods by record type.
