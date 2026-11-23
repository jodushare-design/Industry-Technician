import { ROLE_LABELS } from "@itm/core";
import { Alert, Card, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "./no-access";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireStaff("/");
  if (!session) return <NoAccess />;

  const { client } = session;
  const [profiles, suspended, companies] = await Promise.all([
    client.from("profiles").select("id", { count: "exact", head: true }),
    client.from("profiles").select("id", { count: "exact", head: true }).neq("account_status", "active"),
    client.from("organizations").select("id", { count: "exact", head: true }),
  ]);

  const stats = [
    { label: "Accounts", value: profiles.count },
    { label: "Suspended or closed", value: suspended.count },
    { label: "Service companies", value: companies.count },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${session.roles.map((r) => ROLE_LABELS[r]).join(", ")}`}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-sm text-muted">{s.label}</p>
            <p className="text-2xl font-bold">{s.value ?? "—"}</p>
          </Card>
        ))}
      </div>
      <Alert tone="info" title="Platform role reminder">
        Staff can verify accounts, manage the catalogue and handle complaints. Staff cannot create estimates, approve
        work for customers, or assign providers to jobs.
      </Alert>
    </div>
  );
}
