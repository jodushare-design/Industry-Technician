# Spare-Parts Coordination (Prompt 9)

**Code:**
- migration `supabase/migrations/20261122000700_parts.sql`
- `packages/core/src/parts.ts`
- `packages/api/src/parts.ts`
- web: `apps/web/src/app/_parts/parts-board.tsx`, used at `/requests/[id]/parts` and `/work/[id]/parts`

**Not a shop.** There is no cart, payment, supplier commission or stock. Supplier details are information shared between the two parties of the job.

## Fields (brief)

| Field | Column |
|---|---|
| Part name | `part_name` |
| Part number | `part_number` |
| Manufacturer | `manufacturer_text` (optional catalogue link: `catalogue_part_id`) |
| Machine | `customer_machine_id` |
| Model | `model_text` |
| Quantity | `quantity`, with `unit` |
| Photo | private bucket `part-photos` |
| Required specifications | `specifications` |
| Compatibility status | `compatibility`, plus note, who set it and when |
| Supplier name | `supplier_name` |
| Supplier contact | `supplier_contact` |
| Availability | `availability` |
| Price | `unit_price`; `total_price` generated |
| Expected delivery | `expected_delivery` |
| Arranged by | `arranged_by` (customer or provider) |
| Approval status | `stage` and decision fields |

## Workflow and rules

1. **Identified.** Either side of an engaged job adds the part. Other providers and strangers cannot.
2. **Compatibility.** It starts *unknown*.
   - Only the provider can record *confirmed by provider*.
   - *Confirmed by supplier* needs a note saying who confirmed it and how.
   - *Not compatible* blocks approval.
   - The platform never checks compatibility, and the screens say so.
3. **Availability and price.** Sending for approval needs both (and not "unavailable").
4. **Sent for customer approval.** The part's content is **frozen** (trigger) and **fingerprinted**, and a parts card is posted in the chat.
5. **Customer approves or rejects.**
   - Customer only: providers, strangers and platform admins are refused.
   - The fingerprint must match.
   - On approval the customer chooses **who arranges** the part.
   - An unconfirmed-compatibility warning is shown before approval.
6. **Arranged → received → installed.**
   - Arranged and received: the arranging side or the provider.
   - **Installed: provider only.**
   - Cancel, with a reason, at any stage before installation.
7. **Completion report.** Prompt 10 lists the installed parts.

**Separate from the estimate:** approved part costs are recorded on the part, **not** added to any estimate. A test checks the accepted estimate's total is unchanged.

**Never deleted:** parts and their stage history (`part_status_events`, append-only) are kept.

## Tests

`supabase/tests/parts.test.ts` (12 tests) covers:
- who can add parts;
- compatibility rules;
- price and availability needed before approval;
- freeze, fingerprint and card on submit;
- customer-only approval with a matching fingerprint and arranged-by;
- the estimate total unchanged;
- the stage order, installed recorded by the provider only;
- append-only history;
- rejection and cancellation;
- privacy of rows and photos;
- no payment or commission columns.

**Bug found and fixed:** a missing "arranged by" (NULL) slipped past `NOT IN`. Fixed with `coalesce`. The same fix was applied to the estimate decision, which now has a regression test.
