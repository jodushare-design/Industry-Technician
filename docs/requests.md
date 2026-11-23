# Service Requests and Provider Discovery (Prompt 6)

**Code:**
- migration `supabase/migrations/20261122000400_requests.sql`
- `packages/core/src/requests.ts`
- `packages/api/src/requests.ts`
- web: `/requests` (customers) and `/work` (providers)
- admin: `/requests` (read-only)

## Customer flow

1. **Ask for help** (`/requests/new`) asks, in order:
   1. What help? (repair, maintenance, installation, inspection, other)
   2. Which factory?
   3. Industry and machine: one of my machines, any catalogue machine type, or *"I don't know the machine name"*, plus optional make and model.
   4. What is happening? The ten problem options from the brief, plus a description.
   5. When? (urgency and preferred date)
2. On the request page, add **photos, short videos or voice notes**:
   - recorded in the browser, up to 2 minutes;
   - private storage, up to 20 files of 50 MB;
   - a retry button for each failed upload.
3. **Find providers**: a ranked list, each with *"Why this match"*. Reasons are factual and labelled *stated by provider* or *by the platform*; there are no guarantees or certification claims.
4. **Contact provider**: up to 5 open at a time. Withdraw any time before an estimate is approved.
5. Once providers accept, **Choose this provider**. The customer selects; the platform never assigns.
6. **Cancel** with a reason. This closes open invitations, and the providers see the reason.

## Provider flow (`/work`)

- An inbox of requests sent to the profiles you manage. A company's requests go to its company admins; employees cannot accept for the company.
- Before accepting, a provider sees:
  - the machine, the customer's description and media;
  - the area and district;
  - the customer's first name.
- After **Accept**, they also see the factory name, full address and the customer's full name.
- Phone numbers are never shown here; contact sharing comes with chat (Prompt 7).
- **Decline**, with an optional reason.

## Matching (`match_providers`, in SQL)

Only the request's customer (or staff) can run it.

**Candidates:**
- approved individual technicians and service companies;
- not "unavailable";
- account active.

A company is matched on its own skills **and its approved employees' skills**.

**Eligibility:**
1. Relevance: at least one of
   - the exact machine type;
   - its equipment category;
   - a service skill linked to the machine or category;
   - for *"I don't know"*, any provider (machines in the chosen industry score higher).
2. Location: one of
   - within the provider's travel radius (distance between the factory and the provider's base, both optional coordinates);
   - the factory's district is covered;
   - the factory has no location at all, in which case the reasons say "location not compared".

**Score:**

| Factor | Points |
|---|---|
| Exact machine | 50 + years (capped at 20) |
| Category | 25 |
| Service skill | 15 |
| Industry machines (when the machine is unknown) | 20 |
| Make/model experience | 15 |
| Distance within radius | up to 20 |
| District covered | 12 |
| Availability | available 10, limited 4 |
| Identity/business check | 6 |
| Reviewed certificates, licences, insurance | up to 6 |

**Privacy:** each run is stored in `match_results`, which the customer and staff can read. The customer receives an approximate distance and reasons, never the provider's coordinates or documents.

## Job status

All 17 statuses from Prompt 10 exist now.
- Every change goes through `private.change_job_status`, which validates the transition (`private.job_transition_allowed`) and records an append-only `job_status_events` row.
- Prompt 6 uses `submitted → finding_providers → provider_contacted → discussion`, plus moves back when providers decline or are withdrawn, and `cancelled`.

## Tests

`supabase/tests/requests.test.ts` (21 tests) covers:
- creation rules: own factory or machine only, customers only, symptom codes, past dates, the unknown machine;
- request privacy;
- matching ranking and reasons;
- company matching via employees;
- exclusions (out of range, unavailable, unapproved);
- no coordinates leaked;
- invitations: limits, duplicates, unapproved providers;
- provider view before and after accepting;
- employees cannot answer for the company;
- selection rules, withdrawal, cancellation;
- the status history and the transition matrix;
- media privacy and types.
