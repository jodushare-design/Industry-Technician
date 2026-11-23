import type { Metadata } from "next";
import { JOB_STATUS_LABELS, SERVICE_TYPE_LABELS, URGENCY_LABELS } from "@itm/core";
import { PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";

export const metadata: Metadata = { title: "Service requests" };
export const dynamic = "force-dynamic";

/** Read-only overview. Staff can follow requests but never assign providers or act for a customer. */
export default async function AdminRequestsPage() {
  const session = await requireStaff("/requests");
  if (!session) return <NoAccess />;
  const { client } = session;
  const { data: requests } = await client
    .from("service_requests")
    .select("id, reference, status, service_type, urgency, machine_type_id, customer_id, factory_id, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const rs = requests ?? [];
  const [{ data: types }, { data: customers }, { data: factories }, { data: invitations }] = rs.length
    ? await Promise.all([
        client.from("catalogue_entities").select("id, name").in("id", [...new Set(rs.map((r) => r.machine_type_id))]),
        client.from("profiles").select("id, full_name").in("id", [...new Set(rs.map((r) => r.customer_id))]),
        client.from("factories").select("id, locality, district").in("id", [...new Set(rs.map((r) => r.factory_id))]),
        client.from("request_invitations").select("request_id, status").in("request_id", rs.map((r) => r.id)),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const typeName = new Map((types ?? []).map((t) => [t.id, t.name]));
  const customerName = new Map((customers ?? []).map((c) => [c.id, c.full_name]));
  const place = new Map((factories ?? []).map((f) => [f.id, [f.locality, f.district].filter(Boolean).join(", ")]));

  return (
    <div>
      <PageHeader title="Service requests" description="Latest 200. Read-only: customers choose and contact providers themselves." />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-subtle">
            <tr>
              <th className="px-3 py-2">Reference</th><th className="px-3 py-2">Machine / help</th><th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Where</th><th className="px-3 py-2">Urgency</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Providers contacted</th>
            </tr>
          </thead>
          <tbody>
            {rs.map((r) => {
              const inv = (invitations ?? []).filter((i) => i.request_id === r.id);
              return (
                <tr key={r.id} className="border-t border-line align-top">
                  <td className="px-3 py-2 font-mono text-xs">{r.reference}</td>
                  <td className="px-3 py-2">{typeName.get(r.machine_type_id)} · {SERVICE_TYPE_LABELS[r.service_type]}</td>
                  <td className="px-3 py-2">{customerName.get(r.customer_id) ?? "—"}</td>
                  <td className="px-3 py-2">{place.get(r.factory_id)}</td>
                  <td className="px-3 py-2">{URGENCY_LABELS[r.urgency]}</td>
                  <td className="px-3 py-2">{JOB_STATUS_LABELS[r.status]}</td>
                  <td className="px-3 py-2">{inv.length} ({inv.filter((i) => i.status === "accepted").length} accepted)</td>
                </tr>
              );
            })}
            {rs.length === 0 && <tr><td colSpan={7} className="px-3 py-6 text-center text-muted">No requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
