import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { openComplaint } from "@itm/api";
import { COMPLAINT_CATEGORY_LABELS, reportError, toAppError, type ComplaintCategory } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Flash, PageHeader, fieldClass, primaryButtonClass } from "@itm/ui";
import { withMessage } from "@/lib/action";

export const metadata: Metadata = { title: "Make a complaint" };
export const dynamic = "force-dynamic";

async function openAction(form: FormData) {
  "use server";
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/complaints/new");
  let target: string;
  try {
    const id = await openComplaint(session.client, {
      requestId: s("requestId") || undefined,
      category: s("category") as ComplaintCategory,
      description: s("description"),
    });
    target = withMessage(`/complaints/${id}`, "notice", "Complaint received. We will acknowledge it within 24 hours.");
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where: "web.complaints.open" });
    target = withMessage("/complaints/new", "error", err.userMessage);
  }
  redirect(target);
}

export default async function NewComplaintPage({ searchParams }: PageProps<"/complaints/new">) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/complaints/new");
  const sp = await searchParams;
  const { data: requests } = await session.client.from("service_requests").select("id, reference, created_at").order("created_at", { ascending: false }).limit(50);
  const preselect = typeof sp.request === "string" ? sp.request : "";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader title="Make a complaint" description="Tell us what happened. Support will contact both sides and follow up." />
      <Flash notice={sp.notice} error={sp.error} />
      <Alert tone="error" title="Is someone hurt, or is there a fire, electric shock or gas leak?">
        Call <strong>112</strong> and your site safety officer first. Then report it here as a safety incident so we can preserve the records and help.
      </Alert>
      <form action={openAction} className="space-y-4">
        <label className="flex flex-col gap-1 text-sm font-medium">About which job (optional)
          <select name="requestId" defaultValue={preselect} className={`${fieldClass} font-normal`}>
            <option value="">Not about a specific job</option>
            {(requests ?? []).map((r) => <option key={r.id} value={r.id}>{r.reference}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">What is it about?
          <select name="category" required defaultValue="" className={`${fieldClass} font-normal`}>
            <option value="" disabled>Choose…</option>
            {Object.entries(COMPLAINT_CATEGORY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">What happened?
          <textarea name="description" required minLength={10} maxLength={4000} rows={6} className={`${fieldClass} py-2 font-normal`} />
        </label>
        <p className="text-sm text-muted">You can add photos, videos or documents after sending. The platform helps both sides resolve complaints; it does not decide technical faults.</p>
        <button className={primaryButtonClass}>Send complaint</button>
      </form>
    </div>
  );
}
