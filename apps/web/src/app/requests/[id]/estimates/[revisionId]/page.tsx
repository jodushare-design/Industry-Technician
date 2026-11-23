import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { decideEstimate, getProviderPublic, listEstimates } from "@itm/api";
import { AMOUNT_FIELDS, AppError, ESTIMATE_KIND_LABELS, ESTIMATE_STATUS_LABELS, approvalStatement, formatInr, toPaise } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Card, DraftLegalBanner, Flash, PageHeader, StatusPill, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { runAction } from "@/lib/action";

export const metadata: Metadata = { title: "Estimate" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function decideAction(form: FormData) {
  "use server";
  const requestId = String(form.get("requestId"));
  const revisionId = String(form.get("revisionId"));
  const decision = String(form.get("decision")) as "accept" | "reject" | "request_revision";
  await runAction(`/requests/${requestId}/estimates/${revisionId}`, "web.estimates.decide", async ({ client }) => {
    if (decision === "accept" && form.get("confirm") !== "on") throw new AppError("validation", { userMessage: "Tick the box to confirm you have read the estimate." });
    await decideEstimate(client, revisionId, decision, String(form.get("hash")), String(form.get("note") ?? ""));
    return decision === "accept"
      ? "Estimate accepted. Agree the visit date and site safety arrangements with the provider."
      : decision === "reject" ? "Estimate rejected. The provider has been told." : "Your requested changes were sent to the provider.";
  });
}

export default async function EstimatePage({ params, searchParams }: PageProps<"/requests/[id]/estimates/[revisionId]">) {
  const { id, revisionId } = await params;
  if (!UUID.test(id) || !UUID.test(revisionId)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/requests/${id}/estimates/${revisionId}`);
  const sp = await searchParams;
  const estimates = await listEstimates(session.client, id);
  const estimate = estimates.find((e) => e.revisions.some((v) => v.id === revisionId));
  const v = estimate?.revisions.find((x) => x.id === revisionId);
  if (!estimate || !v) notFound();
  const provider = await getProviderPublic(session.client, estimate.provider_profile_id).catch(() => null);
  const providerName = provider?.display_name ?? "The provider";
  const { data: request } = await session.client.from("service_requests").select("customer_id, reference").eq("id", id).maybeSingle();
  const isCustomer = request?.customer_id === session.context.profile.id;
  const previous = estimate.revisions.find((x) => x.revision_no === v.revision_no - 1 && x.status !== "draft");
  const total = toPaise(v.total);
  const latest = estimate.revisions.filter((x) => x.status !== "draft")[0];

  return (
    <div className="space-y-6">
      <Link href={`/requests/${id}`} className="text-sm underline">← Back to the request</Link>
      <PageHeader
        title={`${estimate.title} — revision ${v.revision_no}`}
        description={<span className="flex flex-wrap items-center gap-2">From {providerName} (independent service provider) · {ESTIMATE_KIND_LABELS[estimate.kind]} <StatusPill tone={v.status === "accepted" ? "success" : v.status === "sent" ? "warning" : "neutral"}>{ESTIMATE_STATUS_LABELS[v.status]}</StatusPill></span>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      {latest && latest.id !== v.id && (
        <Alert tone="warning">This is not the latest revision. <Link className="underline" href={`/requests/${id}/estimates/${latest.id}`}>See revision {latest.revision_no}</Link>.</Alert>
      )}

      <Card>
        <table className="w-full text-sm">
          <tbody>
            {AMOUNT_FIELDS.map(([k, label]) => {
              const now = toPaise(v[k]);
              const before = previous ? toPaise(previous[k]) : null;
              if (now === 0n && (before === null || before === 0n)) return null;
              return (
                <tr key={k} className="border-b border-line">
                  <td className="py-2">{label}{k === "other_charges" && v.other_charges_note ? ` (${v.other_charges_note})` : ""}{k === "tax_amount" && v.tax_note ? ` (${v.tax_note})` : ""}</td>
                  <td className="py-2 text-right">
                    {before !== null && before !== now && <span className="mr-2 text-muted line-through">{formatInr(before)}</span>}
                    {formatInr(now)}
                  </td>
                </tr>
              );
            })}
            <tr>
              <td className="py-2 text-base font-semibold">Total</td>
              <td className="py-2 text-right text-base font-semibold">
                {previous && toPaise(previous.total) !== total && <span className="mr-2 font-normal text-muted line-through">{formatInr(toPaise(previous.total))}</span>}
                {formatInr(total)}
              </td>
            </tr>
          </tbody>
        </table>
        <dl className="mt-4 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">Scope</dt><dd className="whitespace-pre-wrap">{v.scope}</dd>
          {v.exclusions && (<><dt className="text-muted">Not included</dt><dd className="whitespace-pre-wrap">{v.exclusions}</dd></>)}
          {v.expected_completion && (<><dt className="text-muted">Expected completion</dt><dd>{v.expected_completion}</dd></>)}
          <dt className="text-muted">Valid until</dt><dd>{v.valid_until}</dd>
          {v.notes && (<><dt className="text-muted">Notes</dt><dd className="whitespace-pre-wrap">{v.notes}</dd></>)}
          <dt className="text-muted">Sent</dt><dd>{v.sent_at ? new Date(v.sent_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</dd>
          {v.decided_at && (<><dt className="text-muted">Decided</dt><dd>{new Date(v.decided_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{v.decision_note ? ` — “${v.decision_note}”` : ""}</dd></>)}
          <dt className="text-muted">Record</dt><dd className="font-mono text-xs break-all">Fingerprint {v.content_hash}</dd>
        </dl>
      </Card>

      {isCustomer && v.status === "sent" && (
        <Card className="space-y-4">
          <h2 className="font-semibold">Your decision</h2>
          <DraftLegalBanner />
          <form action={decideAction} className="space-y-3">
            <input type="hidden" name="requestId" value={id} />
            <input type="hidden" name="revisionId" value={v.id} />
            <input type="hidden" name="hash" value={v.content_hash ?? ""} />
            <input type="hidden" name="decision" value="accept" />
            <p className="rounded-md bg-subtle p-3 text-sm">{approvalStatement({ providerName, revisionNo: v.revision_no, total, kind: estimate.kind })}</p>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="confirm" className="mt-1" required /> I have read this estimate, including what is not included.
            </label>
            <button className={primaryButtonClass}>Approve {formatInr(total)}</button>
          </form>
          <div className="grid gap-3 sm:grid-cols-2">
            <form action={decideAction} className="space-y-2">
              <input type="hidden" name="requestId" value={id} />
              <input type="hidden" name="revisionId" value={v.id} />
              <input type="hidden" name="hash" value={v.content_hash ?? ""} />
              <input type="hidden" name="decision" value="request_revision" />
              <label className="flex flex-col gap-1 text-sm">What should change?
                <textarea name="note" required rows={2} maxLength={1000} className="rounded-md border border-line bg-surface px-2 py-1" />
              </label>
              <button className={smallButtonClass}>Ask for changes</button>
            </form>
            <form action={decideAction} className="space-y-2">
              <input type="hidden" name="requestId" value={id} />
              <input type="hidden" name="revisionId" value={v.id} />
              <input type="hidden" name="hash" value={v.content_hash ?? ""} />
              <input type="hidden" name="decision" value="reject" />
              <label className="flex flex-col gap-1 text-sm">Reason (optional)
                <textarea name="note" rows={2} maxLength={1000} className="rounded-md border border-line bg-surface px-2 py-1" />
              </label>
              <button className={smallButtonClass}>Reject</button>
            </form>
          </div>
          <p className="text-xs text-muted">No payment is taken in the app. You pay the provider directly as you agree with them.</p>
        </Card>
      )}

      {estimate.revisions.filter((x) => x.status !== "draft").length > 1 && (
        <Card>
          <h2 className="mb-2 font-semibold">All revisions</h2>
          <ul className="space-y-1 text-sm">
            {estimate.revisions.filter((x) => x.status !== "draft").map((x) => (
              <li key={x.id}>
                <Link className={x.id === v.id ? "font-semibold" : "underline"} href={`/requests/${id}/estimates/${x.id}`}>Revision {x.revision_no}</Link>
                {" "}· {formatInr(toPaise(x.total))} · {ESTIMATE_STATUS_LABELS[x.status]}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
