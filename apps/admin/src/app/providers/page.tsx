import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@itm/ui";
import type { ProviderKind, ProviderStatus } from "@itm/types";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";
import { Flash, StatusBadge } from "./status";

export const metadata: Metadata = { title: "Providers" };
export const dynamic = "force-dynamic";

const KINDS: Record<ProviderKind, string> = { individual: "Independent technicians", company: "Service companies", company_member: "Company employees" };
const STATUSES: ProviderStatus[] = ["submitted", "approved", "draft", "rejected", "suspended"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function ProvidersPage({ searchParams }: PageProps<"/providers">) {
  const session = await requireStaff("/providers");
  if (!session) return <NoAccess />;
  const sp = await searchParams;
  const kind = one(sp.kind) as ProviderKind | "";
  const status = (one(sp.status) || "submitted") as ProviderStatus | "all";

  let q = session.client
    .from("provider_profiles")
    .select("id, kind, display_name, status, base_locality, base_district, submitted_at, updated_at, organization_id, archived_at")
    .is("archived_at", null)
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .limit(300);
  if (kind && kind in KINDS) q = q.eq("kind", kind);
  if (status !== "all" && STATUSES.includes(status)) q = q.eq("status", status);
  const { data } = await q;

  const counts = await Promise.all(
    STATUSES.map(async (st) => {
      let c = session.client.from("provider_profiles").select("id", { count: "exact", head: true }).eq("status", st).is("archived_at", null);
      if (kind && kind in KINDS) c = c.eq("kind", kind);
      return [st, (await c).count ?? 0] as const;
    }),
  );
  const link = (p: Record<string, string>) => `/providers?${new URLSearchParams({ ...(kind && { kind }), status, ...p })}`;

  return (
    <div>
      <PageHeader title={kind ? KINDS[kind] : "Providers"} description="Review submitted profiles, record checks and approve. Waiting longest first." />
      <Flash notice={sp.notice} error={sp.error} />
      <nav className="mb-3 flex flex-wrap gap-2 text-sm">
        <Link href={`/providers?status=${status}`} className={`rounded-md border px-3 py-1.5 ${!kind ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>All kinds</Link>
        {Object.entries(KINDS).map(([k, l]) => (
          <Link key={k} href={`/providers?kind=${k}&status=${status}`} className={`rounded-md border px-3 py-1.5 ${kind === k ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>{l}</Link>
        ))}
      </nav>
      <nav className="mb-4 flex flex-wrap gap-2 text-sm">
        {counts.map(([st, n]) => (
          <Link key={st} href={link({ status: st })} className="rounded border border-line bg-surface px-2 py-1">
            <StatusBadge status={st} /> <span className="ml-1 font-semibold">{n}</span>
          </Link>
        ))}
        <Link href={link({ status: "all" })} className="rounded border border-line bg-surface px-2 py-1">All</Link>
      </nav>
      <div className="overflow-x-auto rounded-lg border border-line bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="bg-subtle">
            <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Kind</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Base</th><th className="px-3 py-2">Submitted</th></tr>
          </thead>
          <tbody>
            {(data ?? []).map((p) => (
              <tr key={p.id} className="border-t border-line">
                <td className="px-3 py-2"><Link href={`/providers/${p.id}`} className="font-medium hover:underline">{p.display_name ?? "(no name yet)"}</Link></td>
                <td className="px-3 py-2">{KINDS[p.kind]}</td>
                <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                <td className="px-3 py-2">{[p.base_locality, p.base_district].filter(Boolean).join(", ") || "—"}</td>
                <td className="px-3 py-2 whitespace-nowrap">{p.submitted_at ? new Date(p.submitted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "—"}</td>
              </tr>
            ))}
            {data?.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted">Nothing here.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
