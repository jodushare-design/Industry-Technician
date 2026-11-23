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

## Quick reporting from saved machines

Customers who saved their machines (Account → Factories and machines) do not re-enter machine details:

- **Report a problem** on each saved machine, and the machine chips at the top of **My requests**, open `/requests/new?machine=<id>` with that machine chosen.
- With a saved machine chosen, the form asks only what is happening (symptom chips and a line or two), urgency and the kind of help. The factory, machine type, make, model and industry come from the saved machine.
- Saving runs matching straight away. The customer lands on the provider list.

## Posting a request (when nobody suitable is listed)

Matching lists only approved providers who state they work on the machine **and** travel to the factory. When that finds nobody, or the customer wants more choice, the customer can **post** the request (`post_service_request`).

- **Who sees it.** Approved, available providers (independent technicians, and service companies through their company admin) who work on that kind of machine: the machine itself, its category or a linked service skill. For "I don't know the machine name" requests, any provider in the area sees it.
  - The area is wider than matching: within twice their travel distance (at least 100 km), in their districts, or anywhere when the locations are not known.
  - Providers approved later see it too.
  - The rule is in `private.posted_request_visible_to`.
- **What they see.** The machine, symptoms, description, urgency, preferred date, locality, district and distance. They do not see the customer's name, exact address, phone, photos or chat. See `list_open_requests` and the page `/work/open`.
- **Offers.**
  - A provider taps **Offer to help**, with an optional note.
  - The customer is notified and decides. **Contact** invites the provider in the normal way (`respond_to_offer` → `invite_provider`), and the provider sees the site details only after accepting. **Decline** keeps the offer on record.
  - Providers can withdraw a pending offer.
  - Offers are rate-limited (Admin → Settings).
- **Ending.** Posting stops when the customer stops it, chooses a provider, approves an estimate, or cancels (trigger `private.end_posting`).
- The platform never assigns or dispatches a provider: the customer always chooses whom to contact.

Tests: `supabase/tests/posting.test.ts`.

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
