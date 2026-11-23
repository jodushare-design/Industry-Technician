import Link from "next/link";
import { listParts, partHistory, partPhotoUrl, type PartRequest } from "@itm/api";
import { AVAILABILITY_LABELS_PART, COMPATIBILITY_LABELS, PART_STAGE_LABELS, PART_UNITS, PART_WORKFLOW, formatInr, toPaise } from "@itm/core";
import type { ItmClient } from "@itm/api";
import { Alert, Card, Flash, PageHeader, StatusPill, fieldClass, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { advancePartAction, compatibilityAction, createPartAction, decidePartAction, submitPartAction, updatePartAction } from "./actions";

const input = "min-h-10 rounded-md border border-line bg-surface px-2 text-sm";
const OPEN_JOB = ["discussion", "estimate_sent", "awaiting_approval", "approved", "scheduled", "provider_travelling", "provider_arrived", "work_in_progress", "waiting_for_parts"];

/** Shared parts board for the customer (/requests/[id]/parts) and the provider (/work/[id]/parts). */
export async function PartsBoard({
  client,
  side,
  requestId,
  providerId,
  reference,
  jobStatus,
  backHref,
  machines,
  notice,
  error,
}: {
  client: ItmClient;
  side: "customer" | "provider";
  requestId: string;
  providerId: string | null;
  reference: string;
  jobStatus: string;
  backHref: string;
  machines: { id: string; label: string }[];
  notice?: string | string[];
  error?: string | string[];
}) {
  const base = `/${side === "customer" ? "requests" : "work"}/${requestId}/parts`;
  const parts = await listParts(client, requestId);
  const history = await partHistory(client, parts.map((p) => p.id));
  const photos = new Map(await Promise.all(parts.filter((p) => p.photo_path).map(async (p) => [p.id, await partPhotoUrl(client, p.photo_path!)] as const)));
  const canAdd = !!providerId && OPEN_JOB.includes(jobStatus);
  const hidden = (p?: PartRequest) => (
    <>
      <input type="hidden" name="base" value={base} />
      <input type="hidden" name="requestId" value={requestId} />
      {p && <input type="hidden" name="partId" value={p.id} />}
    </>
  );

  return (
    <div className="space-y-6">
      <Link href={backHref} className="text-sm underline">← Back to the request</Link>
      <PageHeader title="Spare parts" description={`${reference} · parts are approved separately and never added to an approved estimate`} />
      <Flash notice={notice} error={error} />
      <Alert tone="info">
        The platform does not sell parts or take any commission. Whoever arranges a part buys it directly from the supplier.
        Compatibility must be confirmed by the provider or the supplier — the platform does not check it.
      </Alert>

      {parts.length === 0 && <p className="text-muted">No parts yet.</p>}
      {parts.map((p) => {
        const mine = history.filter((h) => h.part_id === p.id);
        const total = p.total_price ? formatInr(toPaise(p.total_price)) : "—";
        const editableIdentity = p.stage === "identified";
        const editableLogistics = ["identified", "approved", "arranged"].includes(p.stage);
        return (
          <Card key={p.id} className="space-y-3">
            <div id={`part-${p.id}`} className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold">{p.part_name}{p.part_number ? ` · ${p.part_number}` : ""}</h2>
                <p className="text-sm text-muted">
                  {[p.manufacturer_text, p.model_text].filter(Boolean).join(" · ")} · {Number(p.quantity)} {p.unit}
                  {p.unit_price && ` × ${formatInr(toPaise(p.unit_price))} = `}<span className="font-semibold text-foreground">{p.unit_price ? total : ""}</span>
                </p>
              </div>
              <StatusPill tone={p.stage === "installed" || p.stage === "approved" ? "success" : p.stage === "awaiting_approval" ? "warning" : p.stage === "rejected" || p.stage === "cancelled" ? "danger" : "neutral"}>
                {PART_STAGE_LABELS[p.stage]}
              </StatusPill>
            </div>

            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
              {p.specifications && (<><dt className="text-muted">Specifications</dt><dd className="whitespace-pre-wrap">{p.specifications}</dd></>)}
              <dt className="text-muted">Compatibility</dt>
              <dd className={p.compatibility === "unknown" ? "text-warning" : p.compatibility === "not_compatible" ? "text-danger" : ""}>
                {COMPATIBILITY_LABELS[p.compatibility]}{p.compatibility_note ? ` — ${p.compatibility_note}` : ""}
              </dd>
              <dt className="text-muted">Supplier</dt><dd>{[p.supplier_name, p.supplier_contact].filter(Boolean).join(" · ") || "—"}</dd>
              <dt className="text-muted">Availability</dt><dd>{AVAILABILITY_LABELS_PART[p.availability]}{p.expected_delivery ? ` · expected ${p.expected_delivery}` : ""}</dd>
              {p.arranged_by && (<><dt className="text-muted">Arranged by</dt><dd>{p.arranged_by === "customer" ? "Customer" : "Provider"}</dd></>)}
              {p.decision_note && (<><dt className="text-muted">Customer note</dt><dd>{p.decision_note}</dd></>)}
            </dl>
            {photos.get(p.id) && (
              // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
              <img src={photos.get(p.id)!} alt={`Photo of ${p.part_name}`} className="max-h-48 rounded-md" />
            )}

            {editableLogistics && (
              <details className="rounded-md border border-line p-3 text-sm">
                <summary className="cursor-pointer font-medium">{editableIdentity ? "Supplier, availability and price" : "Supplier and delivery"}</summary>
                <form action={updatePartAction} className="mt-2 grid gap-2 sm:grid-cols-3">
                  {hidden(p)}
                  <label className="flex flex-col">Supplier<input name="supplier_name" defaultValue={p.supplier_name ?? ""} className={input} disabled={!editableIdentity} /></label>
                  <label className="flex flex-col">Supplier contact<input name="supplier_contact" defaultValue={p.supplier_contact ?? ""} className={input} /></label>
                  <label className="flex flex-col">Availability
                    <select name="availability" defaultValue={p.availability} className={input}>
                      {Object.entries(AVAILABILITY_LABELS_PART).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  </label>
                  {editableIdentity && <label className="flex flex-col">Price per unit (₹)<input name="unit_price" inputMode="decimal" defaultValue={p.unit_price ?? ""} className={input} /></label>}
                  {editableIdentity && <label className="flex flex-col">Quantity<input name="quantity" inputMode="decimal" defaultValue={p.quantity} className={input} /></label>}
                  <label className="flex flex-col">Expected delivery<input name="expected_delivery" type="date" defaultValue={p.expected_delivery ?? ""} className={input} /></label>
                  <div className="sm:col-span-3"><button className={smallButtonClass}>Save</button></div>
                </form>
              </details>
            )}

            {!["installed", "cancelled", "rejected"].includes(p.stage) && (
              <form action={compatibilityAction} className="flex flex-wrap items-end gap-2 text-sm">
                {hidden(p)}
                <label className="flex flex-col">Compatibility
                  <select name="compatibility" defaultValue={p.compatibility} className={input}>
                    <option value="unknown">{COMPATIBILITY_LABELS.unknown}</option>
                    {side === "provider" && <option value="confirmed_by_provider">{COMPATIBILITY_LABELS.confirmed_by_provider}</option>}
                    <option value="confirmed_by_supplier">{COMPATIBILITY_LABELS.confirmed_by_supplier}</option>
                    <option value="not_compatible">{COMPATIBILITY_LABELS.not_compatible}</option>
                  </select>
                </label>
                <label className="flex flex-1 flex-col">How was it confirmed?<input name="note" className={input} placeholder="e.g. matched old part number; supplier confirmed by phone" /></label>
                <button className={smallButtonClass}>Record</button>
              </form>
            )}

            <div className="flex flex-wrap gap-2 text-sm">
              {p.stage === "identified" && (
                <form action={submitPartAction}>{hidden(p)}<button className={primaryButtonClass}>Send for customer approval</button></form>
              )}
              {p.stage === "approved" && (side === p.arranged_by || side === "provider") && (
                <form action={advancePartAction}>{hidden(p)}<input type="hidden" name="stage" value="arranged" /><button className={smallButtonClass}>Mark as ordered / arranged</button></form>
              )}
              {p.stage === "arranged" && (side === p.arranged_by || side === "provider") && (
                <form action={advancePartAction}>{hidden(p)}<input type="hidden" name="stage" value="received" /><button className={smallButtonClass}>Mark as received</button></form>
              )}
              {p.stage === "received" && side === "provider" && (
                <form action={advancePartAction}>{hidden(p)}<input type="hidden" name="stage" value="installed" /><button className={smallButtonClass}>Mark as installed</button></form>
              )}
              {["identified", "awaiting_approval", "approved", "arranged"].includes(p.stage) && (
                <form action={advancePartAction} className="flex gap-2">
                  {hidden(p)}<input type="hidden" name="stage" value="cancelled" />
                  <input name="note" required placeholder="Reason" aria-label={`Reason for cancelling ${p.part_name}`} className={input} />
                  <button className="text-danger underline">Cancel part</button>
                </form>
              )}
            </div>

            {side === "customer" && p.stage === "awaiting_approval" && (
              <div className="rounded-md border border-warning bg-warning-soft p-3 text-sm">
                <p className="mb-2 font-semibold">Approve this part cost? {total}</p>
                {p.compatibility === "unknown" && <p className="mb-2 text-warning">Compatibility has not been confirmed. Ask the provider or supplier before approving.</p>}
                <form action={decidePartAction} className="flex flex-wrap items-end gap-2">
                  {hidden(p)}
                  <input type="hidden" name="hash" value={p.approval_hash ?? ""} />
                  <input type="hidden" name="approve" value="true" />
                  <label className="flex flex-col">Who will arrange it?
                    <select name="arrangedBy" required defaultValue="" className={input}>
                      <option value="" disabled>Choose…</option>
                      <option value="provider">The provider</option>
                      <option value="customer">I will</option>
                    </select>
                  </label>
                  <button className={primaryButtonClass}>Approve {total}</button>
                </form>
                <form action={decidePartAction} className="mt-2 flex flex-wrap items-end gap-2">
                  {hidden(p)}
                  <input type="hidden" name="hash" value={p.approval_hash ?? ""} />
                  <input type="hidden" name="approve" value="false" />
                  <input name="note" placeholder="Reason (optional)" aria-label="Reason for not approving" className={input} />
                  <button className={smallButtonClass}>Do not approve</button>
                </form>
                <p className="mt-2 text-xs text-muted">This cost is separate from your approved estimate. You pay the supplier or provider directly.</p>
              </div>
            )}

            {mine.length > 0 && (
              <details className="text-xs text-muted">
                <summary className="cursor-pointer">History</summary>
                <ul className="mt-1">{mine.map((h) => <li key={h.id}>{new Date(h.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — {PART_STAGE_LABELS[h.to_stage]}{h.note ? ` (${h.note})` : ""}</li>)}</ul>
              </details>
            )}
          </Card>
        );
      })}

      {canAdd && (
        <Card>
          <h2 className="mb-3 font-semibold">Add a part</h2>
          <form action={createPartAction} className="grid gap-3 sm:grid-cols-2">
            {hidden()}
            <input type="hidden" name="providerId" value={providerId ?? ""} />
            <label className="flex flex-col gap-1 text-sm font-medium">Part name<input name="part_name" required className={`${fieldClass} font-normal`} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Part number (if known)<input name="part_number" className={`${fieldClass} font-normal`} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">Manufacturer<input name="manufacturer_text" className={`${fieldClass} font-normal`} /></label>
            <label className="flex flex-col gap-1 text-sm font-medium">For which machine
              <select name="customer_machine_id" defaultValue="" className={`${fieldClass} font-normal`}>
                <option value="">Not specified</option>
                {machines.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">Model<input name="model_text" className={`${fieldClass} font-normal`} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm font-medium">Quantity<input name="quantity" defaultValue="1" inputMode="decimal" className={`${fieldClass} font-normal`} /></label>
              <label className="flex flex-col gap-1 text-sm font-medium">Unit
                <select name="unit" defaultValue="pcs" className={`${fieldClass} font-normal`}>{PART_UNITS.map((u) => <option key={u}>{u}</option>)}</select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">Required specifications
              <textarea name="specifications" rows={2} maxLength={2000} className={`${fieldClass} py-2 font-normal`} />
            </label>
            <div className="sm:col-span-2"><button className={primaryButtonClass}>Add part</button></div>
          </form>
        </Card>
      )}

      <details className="text-sm text-muted">
        <summary className="cursor-pointer">How parts coordination works</summary>
        <ol className="mt-2 list-decimal pl-5">{PART_WORKFLOW.map((s) => <li key={s}>{s}</li>)}</ol>
      </details>
    </div>
  );
}
