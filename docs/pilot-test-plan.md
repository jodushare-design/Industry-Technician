# Pilot Test Plan

How the marketplace is tested before the first pilot customer is invited, and what is still open. Prompt 12 says not to release based only on visual completion. This plan therefore pairs **automated end-to-end journeys** with **manual checks on real phones**.

**Status (2026-11-23): not ready for a public launch. The website and admin portal are ready for a supervised pilot only once the outstanding items in [release/known-limitations.md](release/known-limitations.md) are closed.** The Android app is not ready: it has sign-in and account screens only.

## 1. What runs automatically

`npm run check` runs:
- the guards: wording, secrets, payments and legal drafts;
- the typecheck of every workspace;
- all unit tests and database tests.

The database tests run on PGlite (in-process Postgres) with a small Supabase stand-in. Every database function and row-level security rule is exercised as the real caller: customer, technician, company admin, employee, support, platform admin or anonymous visitor.

The latest recorded run is in [release/test-results.md](release/test-results.md).

### End-to-end pilot journeys: `supabase/tests/pilot.test.ts`

**Rice mill pilot.** A new customer registers *Pilot Rice Mill* with ten machines:
- paddy cleaner, destoner, rubber roll husker, paddy separator, rice whitener;
- rice polisher, rotary sifter, colour sorter, air compressor, electrical panel.

The customer then takes one husker breakdown to completion. Each step runs as the person who would do it:

| Step | What is checked |
|---|---|
| Customer registration | Customer role, all legal documents accepted, nothing pending |
| Machine selection | Catalogue search finds the husker; ten machines saved at the mill |
| Fault reporting | Emergency breakdown with symptoms; reference `SR-YYMM-NNNNN`; status `submitted` |
| Photo / video upload | Photo and video attached; executable type refused |
| Technician discovery | Matching offers the nearby husker technician with factual reasons and never offers an unapproved one. The provider sees no exact address until they accept. Only the accepted provider can open the photo. |
| In-app chat | Customer and technician exchange messages in order; an outsider cannot post |
| Estimate | Provider sends revision 1; the customer asks for changes; revision 2 is sent. Revision 1 is kept, superseded, with its own total. |
| Customer approval | Provider, support and admin cannot approve. An approval of content that differs from what the customer saw is refused. The customer approves, and the provider is selected. |
| Parts coordination | Part cost submitted by the provider; only the customer approves; tracked through arranged, received and installed; total ₹4,800.00 |
| Job status | Scheduled → travelling → arrived. Work cannot start until both sides confirm site safety; then work starts. Before and after photos are added. |
| Completion report | Fingerprinted report that lists the installed part; status `customer_confirmation_pending` |
| Customer confirmation | Only the customer confirms. The job closes, and the full 17-step status history is checked. |
| Complaint handling | Customer opens a work-quality complaint; the acknowledgement deadline is 24 h. The named provider can see it; another technician cannot. Support acknowledges, the provider replies, and support internal notes stay hidden from the parties. Only staff resolve and close it. Complaints cannot be deleted, and the steps are audited. |

**General industry pilot.** A verified technician near Hyderabad and a precision-components factory at Patancheru run five jobs:
- CNC machine breakdown (VMC);
- motor / VFD fault;
- pump repair;
- PLC troubleshooting;
- compressor maintenance.

Each job covers request, discovery, acceptance, chat, estimate (an inspection for breakdowns, repair work for maintenance) and customer approval. Rice-mill specialists outside the area must not be offered for this work.

### The 16 required test categories

| # | Category | Automated coverage | Manual / not covered |
|---|---|---|---|
| 1 | Authentication | `foundation` (new auth user → profile; suspended users refused); `security` (anonymous visitors cannot write or call private functions); `api` (`assertPublicKey` refuses secret keys); guards (no service-role key in apps). | Real SMS OTP delivery, resend interval and rate limits are configured in the hosted Supabase project and are **not tested yet** (§3, script A). |
| 2 | Roles | `foundation` (roles: register, grant, revoke; staff-only grants); `core` (roles and permissions); `security` (support vs platform admin on settings; staff-only reports). | Admin portal role screens: manual script E. |
| 3 | Catalogue search | `catalogue` (aliases, search, visibility before/after approval, suggestions, TS/SQL parity, starter content); `pilot` (search finds the husker). | Telugu / Hindi names: research worklist, not tested. |
| 4 | Company employee permissions | `onboarding` (service companies and employees: invites, removal, an employee cannot answer for the company); `foundation` (company isolation); `chat` (company jobs: assignment); `security` (Company A cannot see Company B's employee records or documents). | — |
| 5 | Matching | `requests` (matching: ranking, reasons, distance, company via employee skills, out-of-range and unapproved providers excluded, coordinates never revealed); `pilot` (both pilots). | — |
| 6 | Chat | `chat` (participants only, open/closed conversations, contact-sharing consent, media); `security` (nonparticipants); `pilot`. | Realtime delivery on a phone: script C. Realtime is not available in the local demo, which polls every 30 s. |
| 7 | Attachments | `requests` (request media, wrong types refused); `chat` (media in chat); `completion` (job photos); `onboarding` (private documents); `security` (private buckets, size and type limits, no uploads into another person's folder). | Uploading from a phone camera on a slow network: scripts B and F. |
| 8 | Estimate approval | `estimates` (customer decisions, content fingerprint, company estimates, expiry, NULL inputs); `security` (only the owning customer); `pilot`. | — |
| 9 | Estimate revisions | `estimates` (drafts and sending, revision requested, superseded revisions kept); `pilot` (revision 1 → revision 2). | — |
| 10 | Spare-parts approval | `parts` (pricing, customer-only approval, changed-content refusal, who arranges, stage order, rejection kept, privacy); `security`; `pilot`. | — |
| 11 | Job status | `completion` (only the selected provider updates progress, safety gate, photos, report, confirmation); `requests` (status history); `pilot` (full 17-step history). | — |
| 12 | Complaint handling | `completion` (concerns, complaints, disputes, safety incidents, retention); `core` (complaint rules); `pilot` (complaint through closure). | Staff working the queue in the admin portal: script E. |
| 13 | Row level security | `security` (six headline guarantees with positive controls; meta-tests: RLS on every table, definer functions pin `search_path`, anonymous surface, private buckets, append-only audit log); every feature suite has denial tests. | Re-run the isolation scenarios against the hosted project with real Auth before the pilot ([setup.md §7](setup.md)). |
| 14 | Mobile performance | **None.** | Manual script F on a low-end Android phone. No performance budget is set yet. |
| 15 | Slow network | **None automated.** Chat keeps unsent messages with retry or discard. | Manual script F (Chrome DevTools "Slow 3G" and offline). |
| 16 | Android compatibility | CI bundles the Android JavaScript (`expo export --platform android`). | **Not covered.** The Android app has sign-in and account screens only. Requests, chat, estimates, parts and completion are on the website, which pilot users open in their phone browser. |

## 2. Before each manual session

Use the local demo. It has fictional data only and runs on your computer. Never enter real people's details into it.

```powershell
npm run demo
```

```powershell
npm run demo:env
```

```powershell
npm run dev:web
```

```powershell
npm run dev:admin
```

- Website: http://localhost:3000. Admin portal: http://localhost:3001. The admin portal keeps its own sign-in, so both can be open at once.
- Sign in by tapping a person under **Demo accounts**. The code for any demo number is `123456`.
- To test from a phone on the same Wi-Fi, open `http://<your computer's IP>:3000`. The demo backend is reached at `localhost:54321`, so phone testing needs the computer's IP in `NEXT_PUBLIC_SUPABASE_URL`. Prefer Chrome DevTools device mode, below, unless you are testing the camera.
- Start from clean data with `npm run demo:reset`.

| Demo person | Use for |
|---|---|
| Lakshmi Reddy | Customer, Sri Lakshmi Rice Mill |
| Ravi Kumar | Independent technician (huskers, whiteners) |
| Priya Sharma | Service company admin, Alpha Mill Services |
| Suresh Babu | Company employee at Alpha Mill Services |
| Srinivas Rao | Independent technician (colour sorters) |
| Anil Goud | Technician waiting for verification |
| Meena Iyer | Support (admin portal) |
| Arjun Das | Platform administrator (admin portal) |

Record each script as **Pass / Fail / Blocked**, with the phone model, browser, date and a screenshot of any failure. Use the table in [release/test-results.md](release/test-results.md#manual-results).

## 3. Manual scripts

### A. Sign-in (hosted dev project only; not possible in the demo)
1. Sign in with a real Indian mobile number. The SMS arrives within 1 minute. The 6-digit code works once.
2. A wrong code shows a clear error. Asking for a new code within 60 s is refused politely.
3. Sign out. The back button does not reveal signed-in pages.
4. A suspended account (admin → Users) cannot create requests or send messages.

### B. Customer breakdown on a phone (Lakshmi)
1. **Ask for help** → choose the saved husker → tick "Machine stopped" → describe it → Emergency → Continue.
2. Add a photo from the camera, a 10-second video and a voice note. Each shows progress and then appears.
3. **Find providers**. Ravi is listed with reasons. Contact Ravi.
4. Every page fits a 360 px wide screen with no sideways scrolling. Buttons are easy to tap.

### C. Chat and estimate (Ravi on a second device or browser profile)
1. Ravi accepts the request. The customer's exact address now shows.
2. Send messages both ways. The other side sees them within 30 s in the demo, or at once with realtime on the hosted project.
3. Ravi sends an estimate. Lakshmi asks for a change, Ravi sends revision 2, and Lakshmi ticks the consent box and approves.
4. Approving without the tick is blocked. The approval statement names Ravi as the independent provider.

### D. Parts, job and completion
1. Ravi adds a part with a price and submits it. Lakshmi approves it and chooses who arranges it.
2. Ravi schedules the job and confirms site safety. Lakshmi confirms site safety. Ravi starts work, adds before and after photos and submits the completion report.
3. Lakshmi confirms the job and rates it. The job shows **Closed**.

### E. Staff (Meena, then Arjun, on 3001)
1. Dashboard queues match reality: verification waiting, open complaints, disputed jobs.
2. Open Lakshmi's complaint → acknowledge → add a message → resolve → close. The parties see the public steps only.
3. Verify Anil Goud: review the document, record the identity check, approve. Anil now appears in matching.
4. Reports for the last 30 days match the counts above. Settings: Meena can only view; Arjun changes one limit, and it appears in the audit log.

### F. Phones, slow network and offline
1. **Device:** a low-end Android phone (2–3 GB RAM, Chrome), plus Chrome DevTools device mode at 360×800.
2. **Slow 3G:** DevTools → Network → *Slow 3G* (or *3G* in newer Chrome).
   - Home, sign-in, My requests and a request page become usable within 10 s.
   - Every button shows that it is working: "Sending…", "Creating…".
   - Nothing is submitted twice when a button is tapped twice.
3. **Upload on Slow 3G:** a 5 MB photo either finishes or fails with a clear message. The request is not lost.
4. **Offline mid-chat:** DevTools → *Offline* → send a message. It shows as failed with Retry and Discard. Go back online, tap Retry, and it is delivered once.
5. **Page loss:** while offline, a form shows an error, not a blank screen. The error page offers "Try again".
6. **Lighthouse (mobile) on the home page and a request page:** record the Performance and Accessibility scores. No target is agreed yet; record a baseline.

## 4. Exit criteria for inviting the pilot customer

- [ ] `npm run check` and both builds pass on the release commit.
- [ ] Scripts A–F pass on at least two Android phones (one low-end), or the failures are accepted in writing by the founder.
- [ ] The isolation scenarios pass against the hosted project ([setup.md §7](setup.md)).
- [ ] Every item marked "Before the pilot" in [release/known-limitations.md](release/known-limitations.md) is closed.
- [ ] The pilot customer and technicians are onboarded as in [release/pilot-onboarding.md](release/pilot-onboarding.md).
