import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  acknowledgeSiteSafety,
  getRequestForProvider,
  scheduleJob,
  signedUrl,
  submitCompletionReport,
  updateJobProgress,
} from "@itm/api";
import { AppError, JOB_STATUS_LABELS, SAFETY_CHECKLIST, type SafetyItem } from "@itm/core";
import type { JobStatus } from "@itm/types";
import { getSession } from "@itm/next/server";
import { Alert, Card, Flash, PageHeader, StatusPill, fieldClass, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { SimpleUploader } from "@/components/simple-uploader";
import { runAction } from "@/lib/action";

export const metadata: Metadata = { title: "Job" };
export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const back = (f: FormData) => `/work/${s(f, "requestId")}/job`;

async function scheduleAction(form: FormData) {
  "use server";
  await runAction(back(form), "web.job.schedule", async ({ client }) => {
    const local = s(form, "when"); // datetime-local, Indian time
    if (!local) throw new AppError("validation", { userMessage: "Choose the visit date and time." });
    await scheduleJob(client, s(form, "requestId"), new Date(`${local}:00+05:30`).toISOString(), s(form, "note"));
    return "Visit scheduled. The customer has been told.";
  });
}

async function safetyAction(form: FormData) {
  "use server";
  await runAction(back(form), "web.job.safety", async ({ client }) => {
    const items = Object.fromEntries(SAFETY_CHECKLIST.map(([k]) => [k, form.get(k) === "on"])) as Record<SafetyItem, boolean>;
    await acknowledgeSiteSafety(client, s(form, "requestId"), items);
    return "Site-safety checklist recorded.";
  });
}

async function progressAction(form: FormData) {
  "use server";
  await runAction(back(form), "web.job.progress", async ({ client }) => {
    await updateJobProgress(client, s(form, "requestId"), s(form, "status") as JobStatus, s(form, "note"));
    return "Updated. The customer can see it.";
  });
}

async function reportAction(form: FormData) {
  "use server";
  await runAction(back(form), "web.job.report", async ({ client }) => {
    await submitCompletionReport(client, s(form, "requestId"), {
      fault_identified: s(form, "fault_identified"),
      work_performed: s(form, "work_performed"),
      parts_note: s(form, "parts_note"),
      remaining_issues: s(form, "remaining_issues"),
      recommendations: s(form, "recommendations"),
      completed_on: s(form, "completed_on"),
    });
    return "Completion report sent. The customer will confirm or raise a concern.";
  });
}

export default async function ProviderJobPage({ params, searchParams }: PageProps<"/work/[id]/job">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/work/${id}/job`);
  const sp = await searchParams;
  const r = await getRequestForProvider(session.client, id);
  if (!r) notFound();
  const { client } = session;
  const [{ data: req }, { data: acks }, { data: photos }, { data: report }, { data: parts }] = await Promise.all([
    client.from("service_requests").select("scheduled_for, schedule_note, status").eq("id", id).maybeSingle(),
    client.from("site_safety_acks").select("side, acknowledged_at").eq("request_id", id),
    client.from("job_photos").select("id, phase, storage_path").eq("request_id", id).order("created_at"),
    client.from("completion_reports").select("*").eq("request_id", id).maybeSingle(),
    client.from("part_requests").select("part_name, stage").eq("request_id", id),
  ]);
  const status = (req?.status ?? r.status) as JobStatus;
  const myAck = acks?.find((a) => a.side === "provider");
  const customerAck = acks?.find((a) => a.side === "customer");
  const urls = await Promise.all((photos ?? []).map(async (p) => ({ ...p, url: await signedUrl(client, "job-photos", p.storage_path) })));
  const hidden = <input type="hidden" name="requestId" value={id} />;
  const active = ["approved", "scheduled", "provider_travelling", "provider_arrived", "work_in_progress", "waiting_for_parts"].includes(status);
  const steps: [JobStatus, string, JobStatus[]][] = [
    ["provider_travelling", "I'm on the way", ["approved", "scheduled"]],
    ["provider_arrived", "I've arrived", ["approved", "scheduled", "provider_travelling"]],
    ["work_in_progress", "Start work", ["approved", "scheduled", "provider_arrived", "waiting_for_parts"]],
    ["waiting_for_parts", "Waiting for parts", ["work_in_progress"]],
  ];

  if (!r.selected_you) {
    return (
      <div className="space-y-4">
        <Link href={`/work/${id}`} className="text-sm underline">← Back</Link>
        <Alert tone="info">Job progress is available once the customer approves your estimate.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link href={`/work/${id}`} className="text-sm underline">← Back to the request</Link>
      <PageHeader title={`Job — ${r.machine_type}`} description={<span className="flex items-center gap-2">{r.reference} <StatusPill tone="warning">{JOB_STATUS_LABELS[status]}</StatusPill></span>} />
      <Flash notice={sp.notice} error={sp.error} />

      {active && (
        <Card>
          <h2 className="mb-2 font-semibold">Visit</h2>
          {req?.scheduled_for && <p className="mb-2 text-sm">Scheduled: {new Date(req.scheduled_for).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}{req.schedule_note ? ` — ${req.schedule_note}` : ""}</p>}
          {["approved", "scheduled"].includes(status) && (
            <form action={scheduleAction} className="flex flex-wrap items-end gap-2 text-sm">
              {hidden}
              <label className="flex flex-col">Date and time (IST)<input type="datetime-local" name="when" required className={fieldClass} /></label>
              <label className="flex flex-col">Note<input name="note" className={fieldClass} /></label>
              <button className={smallButtonClass}>{req?.scheduled_for ? "Reschedule" : "Schedule visit"}</button>
            </form>
          )}
        </Card>
      )}

      {active && (
        <Card>
          <h2 className="mb-1 font-semibold">Site safety</h2>
          <p className="mb-2 text-sm text-muted">Agree these with the customer before starting. The site arranges isolation and permits; you follow safe work practices.</p>
          <p className="mb-2 text-sm">You: {myAck ? `confirmed ${new Date(myAck.acknowledged_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` : "not yet"} · Customer: {customerAck ? "confirmed" : "not yet"}</p>
          <form action={safetyAction} className="space-y-1 text-sm">
            {hidden}
            {SAFETY_CHECKLIST.map(([k, l]) => (
              <label key={k} className="flex items-start gap-2"><input type="checkbox" name={k} required className="mt-1" /> {l}</label>
            ))}
            <button className={smallButtonClass}>Confirm checklist</button>
          </form>
        </Card>
      )}

      {active && (
        <Card>
          <h2 className="mb-2 font-semibold">Progress</h2>
          <div className="flex flex-wrap gap-2">
            {steps.filter(([, , from]) => from.includes(status)).map(([to, label]) => (
              <form key={to} action={progressAction}>
                {hidden}<input type="hidden" name="status" value={to} />
                <button className={to === "work_in_progress" ? primaryButtonClass : smallButtonClass}>{label}</button>
              </form>
            ))}
          </div>
          {!myAck && <p className="mt-2 text-sm text-muted">Confirm the site-safety checklist before starting work.</p>}
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Before and after photos</h2>
        <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {urls.map((p) => (
            <li key={p.id} className="text-xs">
              {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL */}
              {p.url && <img src={p.url} alt={`${p.phase} photo`} className="aspect-square w-full rounded object-cover" />}
              {p.phase}
            </li>
          ))}
        </ul>
        {!report && active && (
          <div className="flex flex-wrap gap-3">
            <SimpleUploader target="job-photo" id={id} phase="before" label="Add a 'before' photo" accept="image/jpeg,image/png,image/webp" />
            <SimpleUploader target="job-photo" id={id} phase="after" label="Add an 'after' photo" accept="image/jpeg,image/png,image/webp" />
          </div>
        )}
      </Card>

      {report ? (
        <Card>
          <h2 className="mb-2 font-semibold">Completion report (sent)</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">Fault you identified</dt><dd className="whitespace-pre-wrap">{report.fault_identified}</dd>
            <dt className="text-muted">Work performed</dt><dd className="whitespace-pre-wrap">{report.work_performed}</dd>
            <dt className="text-muted">Completed on</dt><dd>{report.completed_on}</dd>
          </dl>
        </Card>
      ) : (
        ["work_in_progress", "waiting_for_parts"].includes(status) && (
          <Card>
            <h2 className="mb-1 font-semibold">Completion report</h2>
            <p className="mb-3 text-sm text-muted">This is your record of the job. It is shown to the customer and cannot be changed after sending.</p>
            {(parts ?? []).some((p) => ["approved", "arranged", "received"].includes(p.stage)) && (
              <Alert tone="warning">Some approved parts are not marked installed. Only installed parts are listed in the report.</Alert>
            )}
            <form action={reportAction} className="mt-3 space-y-3">
              {hidden}
              {[
                ["fault_identified", "Fault you identified", true],
                ["work_performed", "Work performed", true],
                ["parts_note", "Notes about parts (installed parts are listed automatically)", false],
                ["remaining_issues", "Any remaining issue", false],
                ["recommendations", "Recommendations", false],
              ].map(([name, label, req]) => (
                <label key={name as string} className="flex flex-col gap-1 text-sm font-medium">
                  {label}
                  <textarea name={name as string} required={req as boolean} rows={3} maxLength={3000} className={`${fieldClass} py-2 font-normal`} />
                </label>
              ))}
              <label className="flex flex-col gap-1 text-sm font-medium">Completion date
                <input type="date" name="completed_on" defaultValue={new Date().toISOString().slice(0, 10)} className={`${fieldClass} font-normal`} />
              </label>
              <button className={primaryButtonClass}>Send completion report</button>
            </form>
          </Card>
        )
      )}
    </div>
  );
}
