import type { Metadata } from "next";
import { PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";

export const metadata: Metadata = { title: "Customers" };
export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const session = await requireStaff("/customers");
  if (!session) return <NoAccess />;
  const { client } = session;
  const { data: roles } = await client.from("user_roles").select("user_id, granted_at").eq("role", "customer").is("revoked_at", null).order("granted_at", { ascending: false }).limit(300);
  const ids = (roles ?? []).map((r) => r.user_id);
  const [{ data: profiles }, { data: factories }, { data: machines }] = ids.length
    ? await Promise.all([
        client.from("profiles").select("id, full_name, phone, account_status").in("id", ids),
        client.from("factories").select("id, owner_id, name, locality, district, is_active").in("owner_id", ids),
        client.from("customer_machines").select("owner_id").in("owner_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const profileOf = new Map((profiles ?? []).map((p) => [p.id, p]));

  return (
    <div>
      <PageHeader title="Customers" description="Industrial customers and their factories. Latest 300." />
      <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
        <table className="w-full text-left text-sm">
          <thead className="bg-subtle">
            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Mobile</th><th className="px-3 py-2">Factories</th><th className="px-3 py-2">Machines</th><th className="px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            {(roles ?? []).map((r) => {
              const p = profileOf.get(r.user_id);
              const fs = (factories ?? []).filter((f) => f.owner_id === r.user_id && f.is_active);
              return (
                <tr key={r.user_id} className="border-t border-line align-top">
                  <td className="px-3 py-2">{p?.full_name ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{p?.phone ?? "—"}</td>
                  <td className="px-3 py-2">{fs.map((f) => `${f.name} (${[f.locality, f.district].filter(Boolean).join(", ")})`).join("; ") || "—"}</td>
                  <td className="px-3 py-2">{(machines ?? []).filter((m) => m.owner_id === r.user_id).length}</td>
                  <td className="px-3 py-2">{p?.account_status}</td>
                </tr>
              );
            })}
            {roles?.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">No customers yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
