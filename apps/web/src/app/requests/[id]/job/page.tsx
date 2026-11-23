import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { acknowledgeSiteSafety, confirmCompletion, reportConcern, signedUrl } from "@itm/api";
import { COMPLAINT_CATEGORY_LABELS, JOB_STATUS_LABELS, SAFETY_CHECKLIST, type ComplaintCategory, type SafetyItem } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Card, Flash, PageHeader, StatusPill, fieldClass, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { runAction } from "@/lib/action";

export const metadata: Metadata = { title: "Job progress" };
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData) => `/requests/${s(f, "requestId")}/job`;

async function safetyAction(form: FormData) {
  "use server";
  await runAction(back(form), "web.job.customerSafety", async ({ client }) => {
    const items = Object.fromEntries(SAFETY_CHECKLIST.map(([k]) => [k, form.get(k) === "on"])) as Record<SafetyItem, boolean>;
    await acknowledgeSiteSafety(client, s(form, "requestId"), items);
    return "Recorded. Thank you.";
  });
}

async function confirmAction(form: FormData) {
  "use server";
  await runAction(back(form), "web.job.confirm", async ({ client }) => {
    const rating = Number(s(form, "rating"));
    await confirmCompletion(client, s(form, "requestId"), rating >= 1 && rating <= 5 ? rating : undefined, s(form, "comment"));
    return "Job confirmed and closed.";
  });
}

async function concernAction(form: FormData) {
  "use server";
  await runAction(back(form), "web.job.concern", async ({ client }) => {
    await reportConcern(client, s(form, "requestId"), s(form, "category") as ComplaintCategory, s(form, "description"));
    return "Your concern was recorded as a complaint. Our support team will contact both of you within 24 hours.";
  });
}

export default async function CustomerJobPage({ params, searchParams }: PageProps<"/requests/[id]/job">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/requests/${id}/job`);
  const sp = await searchParams;
  const { client } = session;
  const { data: r } = await client.from("service_requests").select("id, reference, status, customer_id, scheduled_for, schedule_note").eq("id", id).maybeSingle();
  if (!r || r.customer_id !== session.context.profile.id) notFound();
  const [{ data: acks }, { data: photos }, { data: report }, { data: events }, { data: complaints }] = await Promise.all([
    client.from("site_safety_acks").select("side, acknowledged_at").eq("request_id", id),
    client.from("job_photos").select("id, phase, storage_path").eq("request_id", id).order("created_at"),
    client.from("completion_reports").select("*").eq("request_id", id).maybeSingle(),
    client.from("job_status_events").select("to_status, created_at, note").eq("request_id", id).order("id"),
    client.from("complaints").select("id, reference, status").eq("request_id", id),
  ]);
  const urls = await Promise.all((photos ?? []).map(async (p) => ({ ...p, url: await signedUrl(client, "job-photos", p.storage_path) })));
  const myAck = acks?.find((a) => a.side === "customer");
  const providerAck = acks?.find((a) => a.side === "provider");
  const parts = (report?.parts_used as { part_name: string; quantity: string; unit: string }[] | undefined) ?? [];
  const hidden = <input type="hidden" name="requestId" value={id} />;

  return (
    <div className="space-y-6">
      <Link href={`/requests/${id}`} className="text-sm underline">← Back to the request</Link>
      <PageHeader title="Job progress" description={<span className="flex items-center gap-2">{r.reference} <StatusPill tone="warning">{JOB_STATUS_LABELS[r.status]}</StatusPill></span>} />
      <Flash notice={sp.notice} error={sp.error} />
      {r.scheduled_for && <Card><p>Visit: <strong>{new Date(r.scheduled_for).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</strong>{r.schedule_note ? ` — ${r.schedule_note}` : ""}</p></Card>}

      {["approved", "scheduled", "provider_travelling", "provider_arrived", "work_in_progress", "waiting_for_parts"].includes(r.status) && (
        <Card>
          <h2 className="mb-1 font-semibold">Site safety — agree with the provider</h2>
          <p className="mb-2 text-sm text-muted">As the site, you arrange access, machine isolation and any permits. Ticking records that these were discussed and agreed.</p>
          <p className="mb-2 text-sm">You: {myAck ? "confirmed" : "not yet"} · Provider: {providerAck ? "confirmed" : "not yet"}</p>
          {!myAck && (
            <form action={safetyAction} className="space-y-1 text-sm">
              {hidden}
              {SAFETY_CHECKLIST.map(([k, l]) => <label key={k} className="flex items-start gap-2"><input type="checkbox" name={k} required className="mt-1" /> {l}</label>)}
              <button className={smallButtonClass}>Confirm</button>
            </form>
          )}
        </Card>
      )}

      {report && (
        <Card>
          <h2 className="mb-2 font-semibold">Completion report from the provider</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Fault they identified</dt><dd className="whitespace-pre-wrap">{report.fault_identified}</dd>
            <dt className="text-muted">Work performed</dt><dd className="whitespace-pre-wrap">{report.work_performed}</dd>
            <dt className="text-muted">Parts installed</dt><dd>{parts.length ? parts.map((p) => `${p.part_name} × ${Number(p.quantity)} ${p.unit}`).join("; ") : "None"}{report.parts_note ? ` — ${report.parts_note}` : ""}</dd>
            {report.remaining_issues && (<><dt className="text-muted">Remaining issue</dt><dd className="whitespace-pre-wrap">{report.remaining_issues}</dd></>)}
            {report.recommendations && (<><dt className="text-muted">Recommendations</dt><dd className="whitespace-pre-wrap">{report.recommendations}</dd></>)}
            <dt className="text-muted">Completed on</dt><dd>{report.completed_on}</dd>
          </dl>
          <p className="mt-2 text-xs text-muted">This report was written by the provider. The platform does not inspect or certify the work.</p>
        </Card>
      )}

      {urls.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Before and after photos</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {urls.map((p) => (
              <li key={p.id} className="text-xs">
                {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
                {p.url && <img src={p.url} alt={`${p.phase} photo`} className="aspect-square w-full rounded object-cover" />}
                {p.phase}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {r.status === "customer_confirmation_pending" && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h2 className="mb-2 font-semibold">Everything fine?</h2>
            <form action={confirmAction} className="space-y-2 text-sm">
              {hidden}
              <label className="flex flex-col">How was it? (optional, private to the platform)
                <select name="rating" defaultValue="" className={fieldClass}>
                  <option value="">No rating</option>
                  {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} / 5</option>)}
                </select>
              </label>
              <textarea name="comment" rows={2} maxLength={1000} placeholder="Comment (optional)" className={`${fieldClass} w-full py-2`} />
              <button className={primaryButtonClass}>Confirm the job is done</button>
            </form>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold">Something not right?</h2>
            <form action={concernAction} className="space-y-2 text-sm">
              {hidden}
              <select name="category" defaultValue="work_quality" className={`${fieldClass} w-full`} aria-label="What is the concern about">
                {(["work_quality", "parts_issue", "price_dispute", "conduct", "safety_incident", "other"] as const).map((c) => <option key={c} value={c}>{COMPLAINT_CATEGORY_LABELS[c]}</option>)}
              </select>
              <textarea name="description" required minLength={10} rows={3} maxLength={4000} placeholder="What is wrong?" className={`${fieldClass} w-full py-2`} />
              <button className={smallButtonClass}>Report a concern</button>
            </form>
            <p className="mt-2 text-xs text-muted">Support follows up with both of you. The platform does not decide technical faults.</p>
          </Card>
        </div>
      )}

      {(complaints ?? []).length > 0 && (
        <Alert tone="info">
          Complaints about this job: {(complaints ?? []).map((c) => <Link key={c.id} className="mr-2 underline" href={`/complaints/${c.id}`}>{c.reference} ({c.status})</Link>)}
        </Alert>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer">Timeline</summary>
        <ul className="mt-2 space-y-1">{(events ?? []).map((e, i) => <li key={i}>{new Date(e.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — {JOB_STATUS_LABELS[e.to_status]}{e.note ? ` (${e.note})` : ""}</li>)}</ul>
      </details>
    </div>
  );
}
