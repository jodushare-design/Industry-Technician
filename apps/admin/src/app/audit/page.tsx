import type { Metadata } from "next";
import { Alert, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";

export const metadata: Metadata = { title: "Audit log" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const session = await requireStaff("/audit");
  if (!session) return <NoAccess />;
  if (!session.isPlatformAdmin) {
    return <Alert tone="error" title="Platform administrators only">Support staff cannot view the audit log.</Alert>;
  }

  const { data, error } = await session.client
    .from("audit_log")
    .select("id, occurred_at, actor_id, action, entity_type, entity_id, details")
    .order("occurred_at", { ascending: false })
    .limit(200);

  if (error) return <Alert tone="error">Could not load the audit log. Please refresh.</Alert>;

  return (
    <div>
      <PageHeader title="Audit log" description="Append-only. Latest 200 entries." />
      <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-subtle">
            <tr>
              <th className="px-3 py-2">When</th>
              <th className="px-3 py-2">Action</th>
              <th className="px-3 py-2">Entity</th>
              <th className="px-3 py-2">Actor</th>
              <th className="px-3 py-2">Details</th>
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="px-3 py-2 whitespace-nowrap">{new Date(e.occurred_at).toLocaleString("en-IN")}</td>
                <td className="px-3 py-2 font-mono text-xs">{e.action}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {e.entity_type}:{e.entity_id?.slice(0, 8)}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{e.actor_id?.slice(0, 8) ?? "system"}</td>
                <td className="px-3 py-2 font-mono text-xs break-all">{JSON.stringify(e.details)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
