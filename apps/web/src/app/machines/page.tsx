import type { Metadata } from "next";
import Link from "next/link";
import { searchCatalogue } from "@itm/api";
import { CATALOGUE_KIND_LABELS, reportError, type CatalogueKind } from "@itm/core";
import { isSupabaseConfigured } from "@itm/next/env";
import { createServerSupabase, getSession } from "@itm/next/server";
import { Alert, Card, PageHeader } from "@itm/ui";
import { getCategories, getRiceMillLine } from "@/lib/catalogue";
import { SuggestForm } from "./suggest-form";

export const metadata: Metadata = {
  title: "Machines",
  description: "Find your industrial machine — rice mill equipment, CNC machines, motors, pumps, compressors, panels and more.",
};
export const dynamic = "force-dynamic";

const KIND_ORDER: CatalogueKind[] = ["machine_type", "component", "fault", "service_skill", "process_stage", "equipment_category", "industry"];

export default async function MachinesPage({ searchParams }: PageProps<"/machines">) {
  if (!isSupabaseConfigured()) {
    return <Alert tone="warning" title="Catalogue not available">The catalogue database is not configured for this environment.</Alert>;
  }
  const sp = await searchParams;
  const q = (Array.isArray(sp.q) ? sp.q[0] : sp.q)?.trim() ?? "";
  const client = await createServerSupabase();
  const session = await getSession();

  let search: Awaited<ReturnType<typeof searchCatalogue>> | null = null;
  if (q.length >= 2) {
    try {
      search = await searchCatalogue(client, q, { channel: "web", limit: 30 });
    } catch (e) {
      reportError(e, { where: "web.machines.search" });
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Find your machine" description="Search by machine name, part, problem or skill. Not sure what it is called? That's fine — choose the generic option." />

      <form method="get" role="search" className="flex flex-wrap gap-2">
        <label htmlFor="q" className="sr-only">Search the catalogue</label>
        <input
          id="q"
          name="q"
          defaultValue={q}
          placeholder="e.g. husker, colour sorter, VFD, compressor"
          className="min-h-11 flex-1 rounded-md border border-line bg-surface px-3 text-base"
        />
        <button className="min-h-11 rounded-md bg-accent px-5 font-semibold text-on-accent hover:bg-accent-strong">Search</button>
      </form>

      {search && <SearchResults q={q} results={search.results} eventId={search.eventId} />}

      <Card>
        <h2 className="font-semibold">Don&apos;t know the machine name?</h2>
        <p className="mt-1 text-sm text-muted">
          Choose <Link className="underline" href="/machines/machine.unknown">&quot;I don&apos;t know the machine name&quot;</Link> when you
          raise a request, and add photos. Providers will ask questions to identify it.
        </p>
      </Card>

      {!search && <Browse client={client} />}

      <section className="max-w-xl">
        <h2 className="mb-2 font-semibold">Something missing?</h2>
        {session ? (
          <SuggestForm defaultName={search && search.results.length === 0 ? q : ""} />
        ) : (
          <p className="text-sm text-muted">
            <Link className="underline" href={`/sign-in?next=${encodeURIComponent(`/machines${q ? `?q=${encodeURIComponent(q)}` : ""}`)}`}>Sign in</Link> to
            suggest a machine, make, model or part. Our team reviews every suggestion before it is added.
          </p>
        )}
      </section>
    </div>
  );
}

function SearchResults({ q, results, eventId }: { q: string; results: Awaited<ReturnType<typeof searchCatalogue>>["results"]; eventId: number | null }) {
  if (results.length === 0) {
    return <Alert tone="info" title={`No matches for "${q}"`}>Try another name, or suggest it below.</Alert>;
  }
  const groups = KIND_ORDER.map((k) => [k, results.filter((r) => r.kind === k)] as const).filter(([, rs]) => rs.length);
  return (
    <section aria-label="Search results" className="space-y-4">
      {groups.map(([kind, rs]) => (
        <div key={kind}>
          <h2 className="mb-2 text-sm font-semibold text-muted uppercase">{CATALOGUE_KIND_LABELS[kind]}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {rs.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/machines/${r.key}${eventId ? `?e=${eventId}` : ""}`}
                  className="block rounded-md border border-line bg-surface p-3 hover:border-accent"
                >
                  <span className="font-medium">{r.name}</span>
                  {r.matched_alias && <span className="ml-2 text-sm text-muted">also called &quot;{r.matched_alias}&quot;</span>}
                  {r.regulated_work && <span className="ml-2 rounded bg-warning-soft px-1.5 text-xs text-warning">licensed work may apply</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

async function Browse({ client }: { client: Awaited<ReturnType<typeof createServerSupabase>> }) {
  const [line, categories] = await Promise.all([getRiceMillLine(client), getCategories(client)]);
  if (line.length === 0 && categories.length === 0) {
    return <Alert tone="info">The catalogue is being prepared. Please check back soon.</Alert>;
  }
  return (
    <>
      {line.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">Rice mill — by process stage</h2>
          <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {line.map(({ stage, machines }, i) => (
              <li key={stage.id} className="rounded-lg border border-line bg-surface p-4">
                <h3 className="font-semibold">
                  <span className="mr-2 text-muted">{i + 1}.</span>
                  <Link className="hover:underline" href={`/machines/${stage.key}`}>{stage.name}</Link>
                </h3>
                <ul className="mt-2 flex flex-wrap gap-1.5 text-sm">
                  {machines.map((m) => (
                    <li key={m.id}>
                      <Link className="inline-block rounded border border-line px-2 py-0.5 hover:border-accent" href={`/machines/${m.key}`}>{m.name}</Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}
      {categories.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl font-bold">All industries — by equipment category</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.filter((c) => c.machines.length > 0).map(({ category, machines }) => (
              <details key={category.id} className="rounded-lg border border-line bg-surface p-4">
                <summary className="cursor-pointer font-semibold">{category.name} <span className="text-sm font-normal text-muted">({machines.length})</span></summary>
                <ul className="mt-2 space-y-1 text-sm">
                  {machines.map((m) => (
                    <li key={m.id}><Link className="hover:underline" href={`/machines/${m.key}`}>{m.name}</Link></li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
