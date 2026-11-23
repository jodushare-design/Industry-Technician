import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  acknowledgeComplaint,
  addComplaintMessage,
  assignComplaint,
  closeDisputedJob,
  escalateComplaint,
  setComplaintStatus,
  signedUrl,
  staffReadConversation,
} from "@itm/api";
import { COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, JOB_STATUS_LABELS, RESOLUTION_LABELS, complaintSla, reportError, toAppError, type ComplaintResolution, type ComplaintStatus } from "@itm/core";
import { Alert, Card, Flash, PageHeader, StatusPill } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../../no-access";

export const metadata: Metadata = { title: "Complaint" };
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const input = "min-h-10 rounded-md border border-line bg-surface px-2 text-sm";
const btn = "min-h-10 rounded-md border border-line bg-surface px-3 text-sm hover:bg-subtle";
const ist = (d: string) => new Date(d).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });

async function act(form: FormData) {
  "use server";
  const id = String(form.get("complaintId"));
  if (!UUID.test(id)) redirect("/complaints");
  const session = await requireStaff(`/complaints/${id}`);
  if (!session) redirect("/complaints");
  const s = (k: string) => String(form.get(k) ?? "").trim();
  let msg: string;
  let key = "notice";
  try {
    switch (s("op")) {
      case "ack": await acknowledgeComplaint(session.client, id, s("message")); msg = "Acknowledged. The complainant has been told."; break;
      case "assign_me": await assignComplaint(session.client, id, session.context.profile.id); msg = "Assigned to you."; break;
      case "message": await addComplaintMessage(session.client, id, s("body")); msg = "Message sent to the parties."; break;
      case "note": await addComplaintMessage(session.client, id, s("body"), true); msg = "Internal note saved."; break;
      case "escalate": await escalateComplaint(session.client, id, s("reason")); msg = "Escalated to platform admins."; break;
      case "status":
        await setComplaintStatus(session.client, id, s("status") as ComplaintStatus, (s("resolution") || undefined) as ComplaintResolution | undefined, s("notes"));
        msg = "Status updated.";
        break;
      case "close_job": await closeDisputedJob(session.client, s("requestId"), s("note")); msg = "Disputed job closed."; break;
      default: throw new Error("Unknown action");
    }
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where: "admin.complaints.act" });
    msg = err.userMessage;
    key = "error";
  }
  revalidatePath(`/complaints/${id}`);
  redirect(`/complaints/${id}?${key}=${encodeURIComponent(msg)}`);
}

export default async function AdminComplaintPage({ params, searchParams }: PageProps<"/complaints/[id]">) {
  const session = await requireStaff("/complaints");
  if (!session) return <NoAccess />;
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const { client } = session;
  const { data: c } = await client.from("complaints").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: events }, { data: files }, { data: request }, { data: conversations }, { data: raiser }] = await Promise.all([
    client.from("complaint_events").select("*").eq("complaint_id", id).order("id"),
    client.from("complaint_attachments").select("*").eq("complaint_id", id),
    c.request_id ? client.from("service_requests").select("id, reference, status").eq("id", c.request_id).maybeSingle() : Promise.resolve({ data: null }),
    c.request_id ? client.from("conversations").select("id, provider_profile_id").eq("request_id", c.request_id) : Promise.resolve({ data: [] as { id: string; provider_profile_id: string }[] }),
    client.from("profiles").select("full_name, phone").eq("id", c.raised_by).maybeSingle(),
  ]);
  const links = await Promise.all((files ?? []).map(async (f) => ({ ...f, url: await signedUrl(client, "complaint-files", f.storage_path, 120) })));
  // Viewing a job conversation is an explicit, audited action (?view=<conversation id>)
  const viewing = typeof sp.view === "string" && UUID.test(sp.view) ? sp.view : null;
  const transcript = viewing ? await staffReadConversation(client, id, viewing).catch(() => null) : null;
  const sla = complaintSla(c);
  const hidden = (op: string) => (<><input type="hidden" name="complaintId" value={id} /><input type="hidden" name="op" value={op} /></>);

  return (
    <div className="space-y-6">
      <Link href="/complaints" className="text-sm underline">← Complaints</Link>
      <PageHeader title={`Complaint ${c.reference}`} description={
        <span className="flex flex-wrap items-center gap-2">{COMPLAINT_CATEGORY_LABELS[c.category]} · <StatusPill tone={c.severity === "critical" ? "danger" : "neutral"}>{c.severity}</StatusPill> {COMPLAINT_STATUS_LABELS[c.status]}{c.escalated && <span className="font-semibold text-danger">ESCALATED</span>}</span>
      } />
      <Flash notice={sp.notice} error={sp.error} />
      {c.category === "safety_incident" && (
        <Alert tone="error" title="Safety incident — follow docs/incident-escalation.md">
          Confirm people are safe and emergency services were called; preserve records (they cannot be deleted); contact both parties; note any statutory reporting the site must do; do not make technical findings.
        </Alert>
      )}
      {sla !== "ok" && sla !== "done" && <Alert tone="error">{sla === "ack_overdue" ? "Acknowledgement is overdue (24 h)." : "Resolution target (15 days) has passed."}</Alert>}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-semibold">Details</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Raised by</dt><dd>{raiser?.full_name ?? "—"} ({c.raised_side}) · {raiser?.phone}</dd>
            <dt className="text-muted">Opened</dt><dd>{ist(c.created_at)}</dd>
            <dt className="text-muted">Acknowledge by</dt><dd>{ist(c.ack_due_at)}{c.acknowledged_at ? ` — done ${ist(c.acknowledged_at)}` : ""}</dd>
            <dt className="text-muted">Resolve by</dt><dd>{ist(c.resolve_due_at)}</dd>
            {request && (<><dt className="text-muted">Job</dt><dd>{request.reference} · {JOB_STATUS_LABELS[request.status]}</dd></>)}
            <dt className="text-muted">Description</dt><dd className="whitespace-pre-wrap">{c.description}</dd>
            {c.resolution && (<><dt className="text-muted">Outcome</dt><dd>{RESOLUTION_LABELS[c.resolution]} — {c.resolution_notes}</dd></>)}
          </dl>
          <ul className="mt-2 text-sm">{links.map((f) => <li key={f.id}>{f.url ? <a className="underline" href={f.url} target="_blank" rel="noopener noreferrer">{f.mime_type}</a> : f.mime_type}</li>)}</ul>
        </Card>

        <Card className="space-y-3">
          <h2 className="font-semibold">Actions</h2>
          {c.status === "open" && (
            <form action={act} className="flex flex-wrap gap-2">{hidden("ack")}<input name="message" placeholder="Acknowledgement message (optional)" className={`${input} flex-1`} /><button className={btn}>Acknowledge</button></form>
          )}
          {c.assigned_to !== session.context.profile.id && <form action={act}>{hidden("assign_me")}<button className={btn}>Assign to me</button></form>}
          <form action={act} className="space-y-1">{hidden("message")}<textarea name="body" required rows={2} placeholder="Message to the parties" className={`${input} w-full py-1`} /><button className={btn}>Send to parties</button></form>
          <form action={act} className="space-y-1">{hidden("note")}<textarea name="body" required rows={2} placeholder="Internal note (staff only)" className={`${input} w-full py-1`} /><button className={btn}>Save internal note</button></form>
          {!c.escalated && <form action={act} className="flex gap-2">{hidden("escalate")}<input name="reason" required placeholder="Why escalate?" className={`${input} flex-1`} /><button className={btn}>Escalate</button></form>}
          <form action={act} className="grid gap-2">
            {hidden("status")}
            <select name="status" className={input} defaultValue={c.status === "resolved" ? "closed" : "resolved"}>
              <option value="in_progress">In progress</option><option value="resolved">Resolved</option><option value="closed">Closed</option>
            </select>
            <select name="resolution" className={input} defaultValue="">
              <option value="">Resolution (needed to resolve)…</option>
              {Object.entries(RESOLUTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            <textarea name="notes" rows={2} placeholder="How it was handled (shown to the parties). Do not state technical findings." className={`${input} py-1`} />
            <button className={btn}>Update status</button>
          </form>
          {request?.status === "disputed" && (
            <form action={act} className="flex gap-2">{hidden("close_job")}<input type="hidden" name="requestId" value={request.id} /><input name="note" required placeholder="Closing note" className={`${input} flex-1`} /><button className={btn}>Close disputed job</button></form>
          )}
        </Card>
      </div>

      <Card>
        <h2 className="mb-2 font-semibold">History</h2>
        <ol className="space-y-1 text-sm">
          {(events ?? []).map((e) => (
            <li key={e.id} className={e.visibility === "staff" ? "rounded bg-warning-soft p-2" : "rounded border border-line p-2"}>
              <span className="text-xs text-muted">{ist(e.created_at)} · {e.kind.replace("_", " ")}{e.visibility === "staff" ? " · staff only" : ""}</span>
              {e.body && <p className="whitespace-pre-wrap">{e.body}</p>}
            </li>
          ))}
        </ol>
      </Card>

      {(conversations ?? []).length > 0 && (
        <Card>
          <h2 className="mb-1 font-semibold">Job conversations</h2>
          <p className="mb-2 text-sm text-muted">Opening a conversation is recorded on this complaint and in the audit log. Open only what you need to handle the complaint.</p>
          <ul className="mb-3 flex flex-wrap gap-2 text-sm">
            {(conversations ?? []).map((cv, i) => <li key={cv.id}><Link className="underline" href={`/complaints/${id}?view=${cv.id}`}>Conversation {i + 1}</Link></li>)}
          </ul>
          {transcript && (
            <ol className="max-h-96 space-y-1 overflow-y-auto text-sm">
              {transcript.map((m, i) => <li key={i}><span className="text-xs text-muted">{ist(m.created_at)} · {m.sender_side}</span> {m.body ?? `[${m.kind}${m.has_file ? " file" : ""}]`}</li>)}
            </ol>
          )}
        </Card>
      )}
    </div>
  );
}
