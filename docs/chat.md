# In-App Chat, Notifications and Optional WhatsApp (Prompt 7)

**Code:**
- migration `supabase/migrations/20261122000500_chat.sql`
- `packages/api/src/chat.ts`
- web: `apps/web/src/components/chat.tsx`, `notification-bell.tsx`, `/notifications`

In-app chat is the **official V1 channel**. WhatsApp is an optional convenience; estimates and approvals stay in the platform.

## Chat

| Requirement | How |
|---|---|
| Job-linked | One conversation per request per contacted provider, created automatically when the customer contacts the provider |
| Who can read and post | The customer, the provider (an individual, or the company's admins) and the **employee the company assigns** to the job. Nobody else, **including platform staff** (complaint access with an audit trail is in Prompt 10). |
| Text, photos, short videos, voice notes | `send_message`. Media goes to the private `chat-media` bucket (50 MB, same types as request media) and is shown through 10-minute signed links. Voice notes are recorded in the browser (2-minute limit). |
| Timestamps | Every message, shown in Indian time |
| Read status | `conversation_reads` (last read per participant). The sender sees **Sent** or **Read**. |
| Notifications | `notifications` table: request received, accepted, declined, closed, job assigned, new message. At most one unread "new message" notice per conversation. A header bell keeps the count live (Realtime); `/notifications` lists them. |
| Upload retry | Every message carries a client-generated id. Retrying never duplicates the message (`unique (sender_id, client_id)`), and media reuses the same object name. Failed sends show **Retry / Discard**. |
| History | Messages cannot be edited or deleted (trigger). A closed conversation stays readable. |
| Live updates | Supabase Realtime on `messages`, with RLS applied to subscribers. Falls back to refreshing when the window is focused and every 30 seconds. |
| Estimate and parts cards | Message kinds `estimate_card` and `parts_card` that point to the estimate or part record. They are created **only** by the estimate and parts functions (Prompts 8 and 9); they cannot be typed into the chat. |
| Rate limit | 30 messages per minute per user |

**When posting is allowed:** while the provider's invitation is `invited` or `accepted` and the request is not closed or cancelled. After that the conversation is read-only.

## Optional phone / WhatsApp hand-off

- Each side chooses **"Agree to share my number"** (`set_contact_sharing`). Numbers are returned by `get_conversation_contacts` **only while both sides currently consent** and the conversation is open.
- Either side can withdraw at any time, which hides the numbers again. Every change is written as a system message and to the audit log.
- A company shares its **business phone**, never the admin's personal number.
- The **Open WhatsApp** link is `wa.me/<number>` with **no job data**, unless the user ticks "Mention request SR-…". The platform sends nothing to WhatsApp.
- A reminder is always shown: *"Estimates and approvals made by phone or WhatsApp are not recorded — please approve in this app."*
- The WhatsApp Business API is **not** used in V1.

## Future: WhatsApp Business Platform (not built, needs separate approval)

| Topic | Design |
|---|---|
| Purpose | Transactional notifications only (e.g. "You have a new message on <app> about request SR-…"). Never estimates, prices or approvals by WhatsApp. |
| Provider | Meta WhatsApp Business Platform (Cloud API), directly or through a BSP. Business verification and a display name are needed. |
| Consent | A separate opt-in per user (`whatsapp_opt_ins`: user, phone, opted_in_at, source, text version). Recorded in-app with its own wording, listed in the privacy notice, withdrawable in settings and by replying STOP. |
| Templates | Utility templates pre-approved by Meta, versioned in the repo with placeholders only (reference number, link). No personal data beyond the first name. |
| Messaging window | Outside the 24-hour customer-service window, templates only. Free-form replies only inside the window, and only for support. |
| Sending | `notifications` row → database webhook → Edge Function `send-whatsapp` (holds the API token as a secret; never in apps) → API. Store `wa_message_id`, status (`sent/delivered/read/failed`) from webhooks, and retries with backoff. |
| Opt-out | Inbound STOP / "unsubscribe" webhook → set `opted_out_at`; suppress all sends. |
| Cost | Per-conversation pricing by category. Budget alerts; utility templates only; batch with a digest where possible. |
| Privacy | Meta becomes a processor/independent controller for message data. Needs DPDP notice, processor agreement and a legal review (compliance-checklist §9). |

## Push notifications (Android)

`notifications.push_sent_at` is reserved. Plan:
- the Expo app registers an Expo push token (`device_tokens` table, owner RLS);
- a database webhook on `notifications` insert calls an Edge Function that sends through the Expo Push API and sets `push_sent_at`.

The push body is the notification title only; no message text is sent for sensitive kinds.

## Tests

`supabase/tests/chat.test.ts` (13 tests) covers:
- conversation creation and system messages;
- participants only (other technicians, strangers, company admins of other jobs, unassigned employees and support staff are all blocked);
- no edits or deletes;
- idempotent retry; no forged cards;
- read status and notification clearing;
- media privacy;
- company assignment (only the admin assigns; only the assigned employee joins);
- consent needed from both sides, plus withdrawal;
- company business phone, audit;
- read-only after withdrawal.

**Bug found and fixed during testing:** the participant check used `uid IN (list)`. A NULL in the list (no assigned employee) made the result NULL instead of false, so a non-participant was not rejected by `get_conversation_contacts`. It now uses `EXISTS`.
