import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JOB_STATUS_LABELS, SERVICE_TYPE_LABELS } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Card, Flash, PageHeader, StatusPill, primaryButtonClass } from "@itm/ui";

export const metadata: Metadata = { title: "My requests" };
export const dynamic = "force-dynamic";

export default async function RequestsPage({ searchParams }: PageProps<"/requests">) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/requests");
  if (!session.roles.includes("customer")) redirect("/work");
  const sp = await searchParams;
  const { data: requests } = await session.client
    .from("service_requests")
    .select("id, reference, status, service_type, machine_type_id, created_at, description")
    .eq("customer_id", session.context.profile.id)
    .order("created_at", { ascending: false })
    .limit(100);
  const { data: myMachines } = await session.client
    .from("customer_machines").select("id, label, machine_type_id").eq("is_active", true).order("created_at").limit(24);
  const typeIds = [...new Set([...(requests ?? []), ...(myMachines ?? [])].map((r) => r.machine_type_id))];
  const { data: names } = typeIds.length ? await session.client.from("catalogue_entities").select("id, name").in("id", typeIds) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="My requests" />
        <Link href="/requests/new" className={`${primaryButtonClass} inline-flex items-center`}>Report a problem</Link>
      </div>
      <Flash notice={sp.notice} error={sp.error} />
      {(myMachines ?? []).length > 0 && (
        <section aria-labelledby="quick" className="rounded-2xl bg-surface p-4 shadow-card">
          <h2 id="quick" className="font-semibold">Report a problem with</h2>
          <p className="text-sm text-muted">Tap a machine — its details are filled in for you.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {(myMachines ?? []).map((m) => (
              <li key={m.id}>
                <Link href={`/requests/new?machine=${m.id}`} className="inline-flex min-h-10 items-center rounded-full bg-blue-soft px-4 text-sm font-semibold text-accent transition hover:brightness-95">
                  {m.label || nameOf.get(m.machine_type_id)}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/account/factories" className="inline-flex min-h-10 items-center rounded-full bg-subtle px-4 text-sm font-semibold transition hover:brightness-95">+ Add a machine</Link>
            </li>
          </ul>
        </section>
      )}
      {(requests ?? []).length === 0 ? (
        <Card><p>No requests yet. When a machine needs attention, choose <strong>Ask for help</strong>.</p></Card>
      ) : (
        <ul className="space-y-3">
          {(requests ?? []).map((r) => (
            <li key={r.id}>
              <Link href={`/requests/${r.id}`} className="block rounded-2xl bg-surface shadow-card p-4 transition hover:shadow-raised hover:-translate-y-0.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{nameOf.get(r.machine_type_id)} · {SERVICE_TYPE_LABELS[r.service_type]}</span>
                  <StatusPill tone={["closed", "cancelled"].includes(r.status) ? "neutral" : r.status === "disputed" ? "danger" : "warning"}>{JOB_STATUS_LABELS[r.status]}</StatusPill>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-muted">{r.description}</p>
                <p className="mt-1 text-xs text-muted">{r.reference} · {new Date(r.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
