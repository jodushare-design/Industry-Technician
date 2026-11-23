import type { Metadata } from "next";
import Link from "next/link";
import { COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS, complaintSla } from "@itm/core";
import { Flash, PageHeader, StatusPill } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";

export const metadata: Metadata = { title: "Complaints" };
export const dynamic = "force-dynamic";

const SLA_LABEL = { ok: "On time", ack_overdue: "Acknowledgement overdue", resolution_overdue: "Resolution overdue", done: "Done" } as const;

export default async function AdminComplaintsPage({ searchParams }: PageProps<"/complaints">) {
  const session = await requireStaff("/complaints");
  if (!session) return <NoAccess />;
  const sp = await searchParams;
  const show = sp.show === "all" ? "all" : "open";
  let q = session.client.from("complaints").select("*").order("escalated", { ascending: false }).order("resolve_due_at").limit(300);
  if (show === "open") q = q.in("status", ["open", "acknowledged", "in_progress"]);
  const { data } = await q;
  const now = new Date();
  const rows = (data ?? []).map((c) => ({ ...c, sla: complaintSla(c, now) }));
  const overdue = rows.filter((r) => r.sla === "ack_overdue" || r.sla === "resolution_overdue").length;

  return (
    <div>
      <PageHeader title="Complaints" description={`Acknowledge within 24 hours; resolution target 15 days. ${overdue} overdue.`} />
      <Flash notice={sp.notice} error={sp.error} />
      <p className="mb-3 text-sm">{show === "open" ? <Link className="underline" href="/complaints?show=all">Show all</Link> : <Link className="underline" href="/complaints">Show open only</Link>}</p>
      <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-subtle">
            <tr><th className="px-3 py-2">Reference</th><th className="px-3 py-2">Category</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Deadline</th><th className="px-3 py-2">Opened</th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="px-3 py-2"><Link className="font-medium underline" href={`/complaints/${c.id}`}>{c.reference}</Link>{c.escalated && <span className="ml-2 text-xs font-semibold text-danger">ESCALATED</span>}</td>
                <td className="px-3 py-2">{COMPLAINT_CATEGORY_LABELS[c.category]}</td>
                <td className="px-3 py-2"><StatusPill tone={c.severity === "critical" ? "danger" : c.severity === "high" ? "warning" : "neutral"}>{c.severity}</StatusPill></td>
                <td className="px-3 py-2">{COMPLAINT_STATUS_LABELS[c.status]}</td>
                <td className="px-3 py-2"><StatusPill tone={c.sla === "ok" || c.sla === "done" ? "neutral" : "danger"}>{SLA_LABEL[c.sla]}</StatusPill></td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(c.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
