import type { Metadata } from "next";
import { ROLE_LABELS } from "@itm/core";
import { Alert, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";
import { StatusForm } from "./status-form";

export const metadata: Metadata = { title: "Users & roles" };
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requireStaff("/users");
  if (!session) return <NoAccess />;

  const [{ data: profiles, error }, { data: roles }] = await Promise.all([
    session.client
      .from("profiles")
      .select("id, full_name, phone, account_status, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    session.client.from("user_roles").select("user_id, role, organization_id").is("revoked_at", null),
  ]);

  if (error) {
    return <Alert tone="error">Could not load users. Please refresh.</Alert>;
  }

  const rolesByUser = new Map<string, string[]>();
  for (const r of roles ?? []) {
    rolesByUser.set(r.user_id, [...(rolesByUser.get(r.user_id) ?? []), ROLE_LABELS[r.role]]);
  }

  return (
    <div>
      <PageHeader title="Users & roles" description="Latest 200 accounts. Status changes are recorded in the audit log." />
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-subtle">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Mobile</th>
              <th className="px-3 py-2">Roles</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Joined</th>
              {session.isPlatformAdmin && <th className="px-3 py-2">Action</th>}
            </tr>
          </thead>
          <tbody>
            {(profiles ?? []).map((p) => (
              <tr key={p.id} className="border-t border-line align-top">
                <td className="px-3 py-2">{p.full_name ?? <span className="text-muted">Not set</span>}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.phone ?? "—"}</td>
                <td className="px-3 py-2">{rolesByUser.get(p.id)?.join(", ") ?? <span className="text-muted">None yet</span>}</td>
                <td className="px-3 py-2 capitalize">{p.account_status}</td>
                <td className="px-3 py-2 whitespace-nowrap">{new Date(p.created_at).toLocaleDateString("en-IN")}</td>
                {session.isPlatformAdmin && (
                  <td className="px-3 py-2">
                    {p.id !== session.context.profile.id && <StatusForm userId={p.id} status={p.account_status} />}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
