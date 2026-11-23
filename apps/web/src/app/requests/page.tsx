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
  const typeIds = [...new Set((requests ?? []).map((r) => r.machine_type_id))];
  const { data: names } = typeIds.length ? await session.client.from("catalogue_entities").select("id, name").in("id", typeIds) : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.id, n.name]));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="My requests" />
        <Link href="/requests/new" className={`${primaryButtonClass} inline-flex items-center`}>Ask for help</Link>
      </div>
      <Flash notice={sp.notice} error={sp.error} />
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
