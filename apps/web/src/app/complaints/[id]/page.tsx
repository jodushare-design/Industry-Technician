import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { addComplaintMessage, signedUrl } from "@itm/api";
import { COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, RESOLUTION_LABELS } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Card, Flash, PageHeader, StatusPill, fieldClass, smallButtonClass } from "@itm/ui";
import { SimpleUploader } from "@/components/simple-uploader";
import { runAction } from "@/lib/action";

export const metadata: Metadata = { title: "Complaint" };
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function messageAction(form: FormData) {
  "use server";
  const id = String(form.get("complaintId"));
  await runAction(`/complaints/${id}`, "web.complaints.message", async ({ client }) => {
    await addComplaintMessage(client, id, String(form.get("body") ?? ""));
    return "Message added.";
  });
}

export default async function ComplaintPage({ params, searchParams }: PageProps<"/complaints/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/complaints/${id}`);
  const sp = await searchParams;
  const { client } = session;
  const { data: c } = await client.from("complaints").select("*").eq("id", id).maybeSingle();
  if (!c) notFound();
  const [{ data: events }, { data: files }] = await Promise.all([
    client.from("complaint_events").select("id, kind, body, created_at, actor_id").eq("complaint_id", id).eq("visibility", "parties").order("id"),
    client.from("complaint_attachments").select("id, storage_path, mime_type").eq("complaint_id", id).order("created_at"),
  ]);
  const links = await Promise.all((files ?? []).map(async (f) => ({ ...f, url: await signedUrl(client, "complaint-files", f.storage_path) })));
  const me = session.context.profile.id;
  const who = (actor: string | null) => (actor === me ? "You" : actor === c.raised_by ? "Complainant" : "Support / other party");

  return (
    <div className="space-y-6">
      <Link href="/complaints" className="text-sm underline">← Complaints</Link>
      <PageHeader title={`Complaint ${c.reference}`} description={<span className="flex items-center gap-2">{COMPLAINT_CATEGORY_LABELS[c.category]} <StatusPill tone={c.status === "resolved" || c.status === "closed" ? "success" : "warning"}>{COMPLAINT_STATUS_LABELS[c.status]}</StatusPill></span>} />
      <Flash notice={sp.notice} error={sp.error} />
      {c.category === "safety_incident" && (
        <Alert tone="error" title="Safety incident">If anyone needs help now, call 112. The records of this job are being preserved.</Alert>
      )}
      <Card>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted">Opened</dt><dd>{new Date(c.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</dd>
          <dt className="text-muted">Acknowledge by</dt><dd>{new Date(c.ack_due_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{c.acknowledged_at ? " (done)" : ""}</dd>
          <dt className="text-muted">Resolution target</dt><dd>{new Date(c.resolve_due_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</dd>
          {c.request_id && (<><dt className="text-muted">Job</dt><dd>{c.raised_side === "customer" ? <Link className="underline" href={`/requests/${c.request_id}`}>Open the job</Link> : <Link className="underline" href={`/work/${c.request_id}`}>Open the job</Link>}</dd></>)}
          {c.resolution && (<><dt className="text-muted">Outcome</dt><dd>{RESOLUTION_LABELS[c.resolution]} — {c.resolution_notes}</dd></>)}
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">History</h2>
        <ol className="space-y-2 text-sm">
          {(events ?? []).map((e) => (
            <li key={e.id} className="rounded-md border border-line p-2">
              <p className="text-xs text-muted">{new Date(e.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · {who(e.actor_id)} · {e.kind.replace("_", " ")}</p>
              {e.body && <p className="whitespace-pre-wrap">{e.body}</p>}
            </li>
          ))}
        </ol>
        {c.status !== "closed" && (
          <form action={messageAction} className="mt-3 space-y-2">
            <input type="hidden" name="complaintId" value={id} />
            <textarea name="body" required rows={3} maxLength={4000} className={`${fieldClass} w-full py-2`} placeholder="Add information or reply to support" />
            <button className={smallButtonClass}>Send</button>
          </form>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Files</h2>
        <ul className="mb-2 space-y-1 text-sm">
          {links.map((f) => <li key={f.id}>{f.url ? <a className="underline" href={f.url} target="_blank" rel="noopener noreferrer">{f.mime_type}</a> : f.mime_type}</li>)}
          {links.length === 0 && <li className="text-muted">No files.</li>}
        </ul>
        {c.status !== "closed" && <SimpleUploader target="complaint-file" id={id} label="Add a photo, video or PDF" accept="image/*,video/*,audio/*,application/pdf" />}
      </Card>
    </div>
  );
}
