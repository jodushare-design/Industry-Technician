import type { Metadata } from "next";
import { getCatalogueSearchReport } from "@itm/api";
import { Alert, Card, PageHeader } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../../no-access";
import { CatalogueNav } from "../ui";

export const metadata: Metadata = { title: "Search analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: PageProps<"/catalogue/analytics">) {
  const session = await requireStaff("/catalogue/analytics");
  if (!session) return <NoAccess />;
  const sp = await searchParams;
  const days = [7, 30, 90].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const report = await getCatalogueSearchReport(session.client, days).catch(() => null);

  return (
    <div>
      <PageHeader title="Search analytics" description="What people search for, and what they can't find. Use zero-result searches to add aliases or new records." />
      <CatalogueNav current="/catalogue/analytics" />
      <form method="get" className="mb-4 flex gap-2 text-sm">
        {[7, 30, 90].map((d) => (
          <button key={d} name="days" value={d} className={`rounded-md border px-3 py-1.5 ${d === days ? "border-accent bg-accent text-on-accent" : "border-line bg-surface"}`}>
            Last {d} days
          </button>
        ))}
      </form>
      {!report ? (
        <Alert tone="error">Could not load the report.</Alert>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card><p className="text-sm text-muted">Searches</p><p className="text-2xl font-bold">{report.total_searches}</p></Card>
            <Card><p className="text-sm text-muted">Searches where a result was chosen</p><p className="text-2xl font-bold">{report.with_selection}</p></Card>
            <Card><p className="text-sm text-muted">Distinct zero-result searches</p><p className="text-2xl font-bold">{report.zero_result_queries.length}</p></Card>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            <ReportTable title="Searches with no results" head={["Query", "Times", "Last"]}
              rows={report.zero_result_queries.map((r) => [r.query, r.searches, new Date(r.last_seen).toLocaleDateString("en-IN")])} />
            <ReportTable title="Top searches" head={["Query", "Times", "Chosen"]}
              rows={report.top_queries.map((r) => [r.query, r.searches, r.selections])} />
            <ReportTable title="Most chosen records" head={["Record", "Times"]}
              rows={report.top_selected.map((r) => [r.name, r.selections])} />
          </div>
        </div>
      )}
    </div>
  );
}

function ReportTable({ title, head, rows }: { title: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <Card>
      <h2 className="mb-2 font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead><tr>{head.map((h) => <th key={h} className="py-1 pr-2 text-muted">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-line">{r.map((c, j) => <td key={j} className="py-1 pr-2">{c}</td>)}</tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}
