import type { Metadata } from "next";
import Link from "next/link";
import { CATALOGUE_KINDS, CATALOGUE_KIND_LABELS, CATALOGUE_STATUSES, normalizeCatalogueText, type CatalogueKind } from "@itm/core";
import type { CatalogueStatus } from "@itm/types";
import { Alert, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";
import { bulkStatusAction } from "./actions";
import { SelectAll } from "./select-all";
import { CatalogueNav, Flash, StatusBadge, VerificationBadge, buttonClass, inputClass, secondaryButtonClass } from "./ui";

export const metadata: Metadata = { title: "Catalogue" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 100;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function CataloguePage({ searchParams }: PageProps<"/catalogue">) {
  const session = await requireStaff("/catalogue");
  if (!session) return <NoAccess />;
  const sp = await searchParams;
  const kind = one(sp.kind) as CatalogueKind | "";
  const status = (one(sp.status) || "pending_review") as CatalogueStatus | "all";
  const q = normalizeCatalogueText(one(sp.q));
  const page = Math.max(1, Number(one(sp.page)) || 1);

  let query = session.client
    .from("catalogue_entities")
    .select("id, key, kind, name, status, verification_status, regulated_work, is_generic, updated_at", { count: "exact" })
    .order("kind")
    .order("sort_order")
    .order("name")
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (kind && (CATALOGUE_KINDS as readonly string[]).includes(kind)) query = query.eq("kind", kind);
  if (status !== "all" && (CATALOGUE_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (q) query = query.like("normalized_name", `%${q}%`);

  const [{ data, count, error }, counts] = await Promise.all([
    query,
    Promise.all(
      CATALOGUE_STATUSES.map(async (s) => {
        const r = await session.client.from("catalogue_entities").select("id", { count: "exact", head: true }).eq("status", s);
        return [s, r.count ?? 0] as const;
      }),
    ),
  ]);

  const back = `/catalogue?${new URLSearchParams({ ...(kind && { kind }), status, ...(q && { q }), page: String(page) })}`;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div>
      <PageHeader title="Catalogue" description="Machines, components, problems and skills. Users only see approved records." />
      <CatalogueNav current="/catalogue" />
      <Flash notice={sp.notice} error={sp.error} />

      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {counts.map(([s, n]) => (
          <Link key={s} href={`/catalogue?status=${s}`} className="rounded border border-line bg-surface px-2 py-1 hover:bg-subtle">
            <StatusBadge status={s} /> <span className="ml-1 font-semibold">{n}</span>
          </Link>
        ))}
      </div>

      <form className="mb-4 flex flex-wrap items-end gap-2" method="get">
        <label className="flex flex-col text-sm">
          Kind
          <select name="kind" defaultValue={kind} className={inputClass}>
            <option value="">All kinds</option>
            {CATALOGUE_KINDS.map((k) => (
              <option key={k} value={k}>{CATALOGUE_KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Status
          <select name="status" defaultValue={status} className={inputClass}>
            <option value="all">All statuses</option>
            {CATALOGUE_STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-sm">
          Name contains
          <input name="q" defaultValue={one(sp.q)} className={inputClass} />
        </label>
        <button className={secondaryButtonClass} type="submit">Filter</button>
      </form>

      {error && <Alert tone="error">Could not load the catalogue. Please refresh.</Alert>}

      <form action={bulkStatusAction}>
        <input type="hidden" name="back" value={back} />
        {session.isPlatformAdmin && (
          <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line bg-surface p-3 text-sm">
            <span className="self-center font-medium">With selected:</span>
            <select name="status" className={inputClass} defaultValue="approved" aria-label="New status">
              <option value="approved">Approve</option>
              <option value="rejected">Reject</option>
              <option value="pending_review">Back to review</option>
              <option value="retired">Retire</option>
            </select>
            <input name="note" placeholder="Reason (required to reject or retire)" className={`${inputClass} min-w-64`} aria-label="Reason" />
            <button className={buttonClass} type="submit">Apply</button>
            <span className="self-center text-muted">Maker-specific records need an external source before they can be approved.</span>
          </div>
        )}

        <div className="overflow-x-auto rounded-2xl bg-surface shadow-card">
          <table className="w-full text-left text-sm">
            <thead className="bg-subtle">
              <tr>
                {session.isPlatformAdmin && (
                  <th className="px-3 py-2"><SelectAll /></th>
                )}
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Kind</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Verification</th>
                <th className="px-3 py-2">Key</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((e) => (
                <tr key={e.id} className="border-t border-line">
                  {session.isPlatformAdmin && (
                    <td className="px-3 py-2">
                      <input type="checkbox" name="ids" value={e.id} aria-label={`Select ${e.name}`} />
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <Link href={`/catalogue/${e.id}`} className="font-medium underline-offset-2 hover:underline">{e.name}</Link>
                    {e.regulated_work && <span className="ml-2 rounded bg-warning-soft px-1.5 text-xs text-warning">regulated</span>}
                    {e.is_generic && <span className="ml-2 rounded bg-subtle px-1.5 text-xs text-muted">generic</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{CATALOGUE_KIND_LABELS[e.kind]}</td>
                  <td className="px-3 py-2"><StatusBadge status={e.status} /></td>
                  <td className="px-3 py-2"><VerificationBadge status={e.verification_status} /></td>
                  <td className="px-3 py-2 font-mono text-xs text-muted">{e.key}</td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted">No records match.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </form>

      <div className="mt-3 flex items-center gap-3 text-sm">
        <span className="text-muted">{count ?? 0} records · page {page} of {pages}</span>
        {page > 1 && <Link className="underline" href={back.replace(/page=\d+/, `page=${page - 1}`)}>Previous</Link>}
        {page < pages && <Link className="underline" href={back.replace(/page=\d+/, `page=${page + 1}`)}>Next</Link>}
      </div>
    </div>
  );
}
