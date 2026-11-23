import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  discardEstimateDraft,
  getRequestForProvider,
  listEstimates,
  saveEstimateDraft,
  sendEstimateRevision,
  withdrawEstimateRevision,
  type EstimateRevision,
} from "@itm/api";
import { AMOUNT_FIELDS, ESTIMATE_KIND_LABELS, ESTIMATE_STATUS_LABELS, formatInr, toPaise, type EstimateKind } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Card, Flash, PageHeader, StatusPill, smallButtonClass } from "@itm/ui";
import { formObject, runAction } from "@/lib/action";
import { EstimateForm, type EstimateFormValues } from "./estimate-form";

export const metadata: Metadata = { title: "Estimates" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: EstimateKind[] = ["inspection", "repair", "additional_work"];

function fieldsFrom(form: FormData) {
  const o = formObject(form);
  return Object.fromEntries(
    ["inspection_fee", "visit_charge", "labour", "travel", "parts", "other_charges", "other_charges_note", "tax_amount", "tax_note", "scope", "exclusions", "expected_completion", "valid_until", "notes"].map((k) => [k, (o[k] as string) ?? ""]),
  );
}

/** Reads the builder form; the returned run() saves it as the provider's draft. */
function save(form: FormData) {
  const requestId = String(form.get("requestId"));
  const kind = String(form.get("kind")) as EstimateKind;
  return {
    requestId,
    run: async (c: Parameters<typeof saveEstimateDraft>[0]) =>
      saveEstimateDraft(c, {
        requestId,
        providerId: String(form.get("providerId")),
        estimateId: (form.get("estimateId") as string) || null,
        kind: KINDS.includes(kind) ? kind : "repair",
        title: String(form.get("title") ?? ""),
        fields: fieldsFrom(form),
      }),
  };
}

async function saveDraftAction(form: FormData) {
  "use server";
  const s = save(form);
  await runAction(`/work/${s.requestId}/estimates`, "web.estimates.save", async ({ client }) => {
    await s.run(client);
    return "Draft saved. The customer cannot see it until you send it.";
  });
}

async function sendAction(form: FormData) {
  "use server";
  const s = save(form);
  await runAction(`/work/${s.requestId}/estimates`, "web.estimates.send", async ({ client }) => {
    const revisionId = await s.run(client);
    await sendEstimateRevision(client, revisionId);
    return "Estimate sent. The customer will review it in the app.";
  });
}

async function withdrawAction(form: FormData) {
  "use server";
  const requestId = String(form.get("requestId"));
  await runAction(`/work/${requestId}/estimates`, "web.estimates.withdraw", async ({ client }) => {
    await withdrawEstimateRevision(client, String(form.get("revisionId")), String(form.get("reason") ?? ""));
    return "Estimate withdrawn.";
  });
}

async function discardAction(form: FormData) {
  "use server";
  const requestId = String(form.get("requestId"));
  await runAction(`/work/${requestId}/estimates`, "web.estimates.discard", async ({ client }) => {
    await discardEstimateDraft(client, String(form.get("revisionId")));
    return "Draft discarded.";
  });
}

const toForm = (r?: EstimateRevision | null): EstimateFormValues => ({
  inspection_fee: r ? r.inspection_fee : "0",
  visit_charge: r ? r.visit_charge : "0",
  labour: r ? r.labour : "0",
  travel: r ? r.travel : "0",
  parts: r ? r.parts : "0",
  other_charges: r ? r.other_charges : "0",
  other_charges_note: r?.other_charges_note ?? "",
  tax_amount: r ? r.tax_amount : "0",
  tax_note: r?.tax_note ?? "",
  scope: r?.scope ?? "",
  exclusions: r?.exclusions ?? "",
  expected_completion: r?.expected_completion ?? "",
  valid_until: r?.valid_until ?? new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
  notes: r?.notes ?? "",
});

export default async function ProviderEstimatesPage({ params, searchParams }: PageProps<"/work/[id]/estimates">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/work/${id}/estimates`);
  const sp = await searchParams;
  const r = await getRequestForProvider(session.client, id);
  if (!r) notFound();
  const engaged = (r.invitations ?? []).find((i) => i.status === "accepted");
  const estimates = await listEstimates(session.client, id);
  const mine = engaged ? estimates.filter((e) => e.provider_profile_id === engaged.provider_id) : [];
  const anyAccepted = mine.some((e) => e.revisions.some((v) => v.status === "accepted"));
  const allowedKinds: EstimateKind[] = anyAccepted ? ["additional_work"] : ["inspection", "repair"];
  // company employees may draft; sending needs company admin or the can_send_estimates grant (checked again in the database)
  const isCompanyAdmin = session.context.roles.some((x) => x.role === "company_admin");
  const isIndividual = session.context.providers.some((p) => p.id === engaged?.provider_id && p.kind === "individual");
  const canSend = isIndividual || isCompanyAdmin || session.context.roles.some((x) => x.role === "company_technician" && x.can_send_estimates);
  const editing = sp.revise ? mine.find((e) => e.id === sp.revise) : undefined;
  const editingBase = editing?.revisions.find((v) => v.status === "draft") ?? editing?.revisions[0];

  return (
    <div className="space-y-6">
      <Link href={`/work/${id}`} className="text-sm underline">← Back to the request</Link>
      <PageHeader title={`Estimates — ${r.machine_type}`} description={`${r.reference} · for ${r.customer_name}`} />
      <Flash notice={sp.notice} error={sp.error} />
      {!engaged && <Card><p>Accept the request before preparing an estimate.</p></Card>}

      {mine.map((e) => (
        <Card key={e.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">{e.title} <span className="text-sm font-normal text-muted">· {ESTIMATE_KIND_LABELS[e.kind]}</span></h2>
            {!e.revisions.some((v) => v.status === "accepted") && (
              <Link href={`/work/${id}/estimates?revise=${e.id}#form`} className={`${smallButtonClass} inline-flex items-center`}>
                {e.revisions.some((v) => v.status === "draft") ? "Edit draft" : "Revise"}
              </Link>
            )}
          </div>
          <ul className="space-y-2">
            {e.revisions.map((v) => (
              <li key={v.id} id={`rev-${v.id}`} className="rounded-md border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Revision {v.revision_no} · <span className="font-semibold">{formatInr(toPaise(v.total))}</span>{v.valid_until && ` · valid until ${v.valid_until}`}</span>
                  <StatusPill tone={v.status === "accepted" ? "success" : v.status === "sent" ? "warning" : v.status === "draft" ? "neutral" : "danger"}>{ESTIMATE_STATUS_LABELS[v.status]}</StatusPill>
                </div>
                <p className="mt-1 text-muted">
                  {AMOUNT_FIELDS.filter(([k]) => Number(v[k]) > 0).map(([k, l]) => `${l} ${formatInr(toPaise(v[k]))}`).join(" · ")}
                </p>
                {v.decision_note && <p className="mt-1">Customer: “{v.decision_note}”</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  {v.status === "draft" && (
                    <form action={discardAction}>
                      <input type="hidden" name="requestId" value={id} />
                      <input type="hidden" name="revisionId" value={v.id} />
                      <button className="text-danger underline">Discard draft</button>
                    </form>
                  )}
                  {v.status === "sent" && canSend && (
                    <form action={withdrawAction} className="flex gap-2">
                      <input type="hidden" name="requestId" value={id} />
                      <input type="hidden" name="revisionId" value={v.id} />
                      <input name="reason" placeholder="Reason (optional)" aria-label="Reason for withdrawing" className="min-h-9 rounded-md border border-line bg-surface px-2" />
                      <button className="underline">Withdraw</button>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {engaged && !["closed", "cancelled", "disputed", "work_completed", "customer_confirmation_pending"].includes(r.status) && (
        <Card>
          <h2 id="form" className="mb-3 font-semibold">{editing ? `Revise: ${editing.title}` : anyAccepted ? "New estimate for additional work" : "New estimate"}</h2>
          {anyAccepted && !editing && (
            <p className="mb-3 text-sm text-muted">Your estimate is approved. Any extra work or parts beyond it needs a new estimate and the customer&apos;s approval before you do it.</p>
          )}
          <EstimateForm
            key={editing?.id ?? "new"}
            requestId={id}
            providerId={engaged.provider_id}
            estimateId={editing?.id}
            kind={editing?.kind}
            allowedKinds={allowedKinds}
            title={editing?.title}
            initial={toForm(editingBase)}
            saveAction={saveDraftAction}
            sendAction={sendAction}
            canSend={canSend}
          />
        </Card>
      )}
    </div>
  );
}
