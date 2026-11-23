# Onboarding and Verification (Prompt 5)

**Code:**
- migration `supabase/migrations/20261122000300_onboarding.sql`
- `packages/core/src/onboarding.ts`
- `packages/api/src/onboarding.ts`
- web: `apps/web/src/app/account/**` and `apps/web/src/app/providers/[id]`
- admin: `apps/admin/src/app/providers/**` and `apps/admin/src/app/customers`

## Journeys

| Who | Web flow (`/account`) |
|---|---|
| Everyone | Phone OTP → **name** (and optional email) → choose role → accept terms (versioned; draft banner while legal review is pending) |
| Customer | **Factories**: name, area, district (33 Telangana districts), PIN, optional GSTIN, optional location from the browser. **Machines** at each factory: catalogue machine type (or *"I don't know the machine name"*), make/model from the catalogue or as free text, label, year, notes. |
| Independent technician | Profile editor: details, languages, availability; service area (base, radius, extra districts); **skills**, one row per machine type / service skill / category with **own years and level**; make/model experience per machine skill; documents; **submit for review** once the checklist is complete |
| Service company | Same editor for the company profile, plus business details (business phone, address, GSTIN, registration number) and business documents. **Team** page: invite employees by mobile number, cancel invitations, remove employees (history kept). |
| Company employee | Accepts the invitation shown in their account (matched to their own OTP-verified number) → edits their own profile and skills → submits. The company admin can also edit the employee's profile and **explicitly copy a single company skill** to them. |

The Android app currently covers sign-in, role choice and terms. The full onboarding forms are on the website; mobile parity is planned (`docs/build-progress.md`).

## Rules enforced in the database

**Experience per person per machine:**
- `provider_skills` holds one row per profile per catalogue item (machine type, equipment category or service skill), each with its own years and level.
- A company's skills are **never** given to employees automatically.
- `copy_company_skill_to_member` copies one skill to one employee. It records `copied_from_skill_id`; a direct insert cannot set that field.

**Separate verification checks:** `verification_checks` records each kind separately:
- `identity`: people only
- `business`: companies only
- `certificate`, `licence`, `insurance`: need the reviewed document and a label

Each check has a pass/fail result, a reviewer and a date, and can be revoked.
- Badges come only from the latest unrevoked decision per kind and label, and only if it passed and is in date (`private.provider_badges`).
- Badge wording comes from `badgeText()`: *"Identity checked (reviewed 20 Nov 2026)"*, *"Certificate reviewed: Colour sorter training, valid until 1 Jan 2030"*. It never says "certified".
- **Mobile verified** comes from the OTP sign-in.

**Status:**
- `draft → submitted` (the provider, once `provider_profile_gaps()` is empty).
- `submitted → approved / rejected`, `approved → suspended`, `suspended → approved / rejected`. Platform admins only; a reason is required to reject or suspend; every change is audited.

**Approval requirements:**

| Profile | Needs |
|---|---|
| Individual | A passed identity check |
| Company | A passed business check |
| Employee | An approved company and a current membership |

**Re-review on identity changes:** changing the name, GSTIN, registration number or business address after approval sends the profile back to `submitted`.

**Private documents:**
- Files go in the private storage bucket `provider-documents` under `<profile id>/<random id>.<ext>`. The user's file name is never used. Allowed: PDF, JPG, PNG or WebP, up to 10 MB.
- Who can read them:
  - the provider's managers;
  - **identity documents: only the person themself**, not even their company admin;
  - platform staff.
- Customers and anonymous visitors cannot read any document. The only exception is **accepted work photos of approved providers**.
- Reviewed documents cannot be deleted by the provider.

**Customer-facing profile:** `get_provider_public()` returns approved providers only (staff and the provider themself can preview). It contains:
- name, bio, languages and availability;
- base area and radius;
- skills, labelled "stated by provider";
- badges and accepted work photos.

It never includes documents, phone numbers or coordinates.

**Customer data:**
- Factories and machines are visible only to their owner and platform staff.
- Machines must reference approved catalogue machine types. Makes and models must be approved and consistent; free text is allowed when not catalogued.

## Admin portal

| Page | Use |
|---|---|
| **Verification queue** (`/providers?status=submitted`) | Submitted profiles, oldest first |
| Provider page | Profile, skills, documents (2-minute signed links), check history with revoke, **record check** (kind, result, document, label, valid-until, note), accept or reject work photos, **decision** (approve / reject / suspend with reason) |
| Technicians / Companies / Company employees | Filtered provider lists |
| Customers | Customers with factories and machine counts |

## Tests

`supabase/tests/onboarding.test.ts` (28 tests) covers:
- Customer A/B isolation and validation;
- Technician A/B isolation;
- skill and make/model rules;
- the submission checklist;
- the identity-check requirement for approval;
- re-review on name change;
- badge expiry and revocation;
- identity documents hidden from customers, anonymous visitors, other providers and the employee's own company admin;
- public profile content (no phone or coordinates);
- work-photo visibility;
- company invitations (only the invited number can accept);
- no automatic skill inheritance, and forged copy markers refused;
- Company B isolation;
- company and employee approval order;
- removing employees.

`packages/core/test/onboarding.test.ts` covers form validation, badge wording and distance.
