import Link from "next/link";
import { ROLE_LABELS } from "@itm/core";
import { Alert, Card, IconTile, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "./no-access";

export const dynamic = "force-dynamic";

const CLOSED_COMPLAINT = "(resolved,closed)";
const CLOSED_REQUEST = "(closed,cancelled)";

export default async function DashboardPage() {
  const session = await requireStaff("/");
  if (!session) return <NoAccess />;

  const { client } = session;
  const head = { count: "exact" as const, head: true };
  const now = new Date().toISOString();
  const [verification, complaintsOpen, complaintsOverdue, ackOverdue, requestsOpen, disputed, suggestions, catalogueReview, profiles, suspended, companies] =
    await Promise.all([
      client.from("provider_profiles").select("id", head).eq("status", "submitted").is("archived_at", null),
      client.from("complaints").select("id", head).not("status", "in", CLOSED_COMPLAINT),
      client.from("complaints").select("id", head).not("status", "in", CLOSED_COMPLAINT).lt("resolve_due_at", now),
      client.from("complaints").select("id", head).eq("status", "open").lt("ack_due_at", now),
      client.from("service_requests").select("id", head).not("status", "in", CLOSED_REQUEST),
      client.from("service_requests").select("id", head).eq("status", "disputed"),
      client.from("catalogue_suggestions").select("id", head).eq("status", "pending"),
      client.from("catalogue_entities").select("id", head).eq("status", "pending_review"),
      client.from("profiles").select("id", head),
      client.from("profiles").select("id", head).neq("account_status", "active"),
      client.from("organizations").select("id", head),
    ]);

  const queues = [
    { label: "Waiting for verification", value: verification.count, href: "/providers?status=submitted", color: "green", glyph: "✓" },
    { label: "Open complaints", value: complaintsOpen.count, href: "/complaints", color: "red", glyph: "!",
      alert: (ackOverdue.count ?? 0) > 0 ? `${ackOverdue.count} not acknowledged in 24 h` : (complaintsOverdue.count ?? 0) > 0 ? `${complaintsOverdue.count} past the resolution date` : undefined },
    { label: "Disputed jobs", value: disputed.count, href: "/requests?status=disputed", color: "orange", glyph: "⚖" },
    { label: "Catalogue suggestions", value: suggestions.count, href: "/catalogue/suggestions", color: "pink", glyph: "+" },
  ] as const;

  const stats = [
    { label: "Open service requests", value: requestsOpen.count, href: "/requests" },
    { label: "Catalogue records to review", value: catalogueReview.count, href: "/catalogue" },
    { label: "Accounts", value: profiles.count, href: "/users" },
    { label: "Suspended or closed", value: suspended.count, href: "/users" },
    { label: "Service companies", value: companies.count, href: "/providers?kind=company&status=all" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description={`Signed in as ${session.roles.map((r) => ROLE_LABELS[r]).join(", ")}`} />

      <section aria-label="Work queues" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {queues.map((q) => (
          <Link key={q.label} href={q.href} className="block rounded-2xl bg-surface p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-raised">
            <div className="flex items-center gap-3">
              <IconTile color={q.color}>{q.glyph}</IconTile>
              <div>
                <p className="text-3xl font-bold tracking-tight tabular-nums">{q.value ?? "—"}</p>
                <p className="text-sm text-muted">{q.label}</p>
              </div>
            </div>
            {"alert" in q && q.alert && <p className="mt-3 rounded-lg bg-red-soft px-2.5 py-1 text-xs font-semibold text-danger">{q.alert}</p>}
          </Link>
        ))}
      </section>

      <Card>
        <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map((s) => (
            <li key={s.label}>
              <Link href={s.href} className="block hover:underline">
                <p className="text-sm text-muted">{s.label}</p>
                <p className="text-xl font-bold tabular-nums">{s.value ?? "—"}</p>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm"><Link className="font-semibold text-accent" href="/reports">See reports →</Link></p>
      </Card>

      <Alert tone="info" title="Platform role reminder">
        Staff can verify accounts, manage the catalogue and handle complaints. Staff cannot create estimates, approve
        work for customers, or assign providers to jobs.
      </Alert>
    </div>
  );
}
