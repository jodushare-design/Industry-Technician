import type { Metadata } from "next";
import Link from "next/link";
import { getAdminReport, type AdminReport, type Count } from "@itm/api";
import {
  COMPLAINT_CATEGORY_LABELS,
  COMPLAINT_STATUS_LABELS,
  JOB_STATUS_LABELS,
  PROVIDER_STATUS_LABELS,
  SERVICE_TYPE_LABELS,
  URGENCY_LABELS,
  toAppError,
} from "@itm/core";
import { Alert, Card, PageHeader, fieldClass, smallButtonClass } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";

export const metadata: Metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
/** Today's date in India as YYYY-MM-DD, shifted by `days`. */
const istDate = (days = 0) => new Date(Date.now() + days * 86400000).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

const KIND_LABELS: Record<string, string> = { individual: "Independent technicians", company: "Service companies", company_member: "Company employees" };
const PRESETS = [
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
];

export default async function ReportsPage({ searchParams }: PageProps<"/reports">) {
  const session = await requireStaff("/reports");
  if (!session) return <NoAccess />;
  const sp = await searchParams;
  const from = DATE.test(one(sp.from)) ? one(sp.from) : istDate(-29);
  const to = DATE.test(one(sp.to)) ? one(sp.to) : istDate();

  let report: AdminReport | null = null;
  let error: string | null = null;
  try {
    report = await getAdminReport(session.client, from, to);
  } catch (e) {
    error = toAppError(e).userMessage;
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="How the marketplace is working: requests, responses, complaints and verification. Counts only — the platform does not handle payments." />

      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
            From
            <input type="date" name="from" defaultValue={from} required className={`${fieldClass} text-foreground`} />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
            To
            <input type="date" name="to" defaultValue={to} required className={`${fieldClass} text-foreground`} />
          </label>
          <button className={smallButtonClass}>Show</button>
          <span className="flex flex-wrap gap-1.5 text-sm">
            {PRESETS.map((p) => (
              <Link key={p.days} href={`/reports?from=${istDate(-(p.days - 1))}&to=${istDate()}`} className="rounded-full bg-subtle px-3 py-1.5 hover:brightness-95">
                {p.label}
              </Link>
            ))}
          </span>
        </form>
        <p className="mt-2 text-xs text-muted">Dates are Indian calendar days. Requests and complaints are counted by the day they were created.</p>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}
      {report && <Report r={report} />}
    </div>
  );
}

function Report({ r }: { r: AdminReport }) {
  const f = r.funnel;
  const pct = (n: number) => (f.created ? `${Math.round((n / f.created) * 100)}%` : "—");
  const hours = (h: number | null) => (h === null ? "—" : h < 48 ? `${h} h` : `${Math.round((h / 24) * 10) / 10} days`);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="New requests" value={r.requests.created} tone="text-ios-orange" />
        <Stat label="Median time to first provider acceptance" value={hours(r.response.median_hours_to_first_acceptance)} tone="text-ios-blue" />
        <Stat label="Complaints opened" value={r.complaints.opened} tone="text-ios-red" hint={r.complaints.overdue_now ? `${r.complaints.overdue_now} overdue now` : "None overdue now"} />
        <Stat label="New accounts" value={r.accounts.new} tone="text-ios-green" />
      </div>

      <Card>
        <h2 className="font-semibold">Request funnel</h2>
        <p className="text-sm text-muted">Of the requests created in this period, how many reached each step.</p>
        <ol className="mt-4 space-y-3">
          {[
            { label: "Created", n: f.created, color: "bg-ios-orange" },
            { label: "A provider accepted", n: f.provider_accepted, color: "bg-ios-blue" },
            { label: "Customer approved an estimate", n: f.estimate_accepted, color: "bg-ios-indigo" },
            { label: "Completed and closed", n: f.completed, color: "bg-ios-green" },
            { label: "Cancelled", n: f.cancelled, color: "bg-ios-red" },
          ].map((s) => (
            <li key={s.label} className="grid grid-cols-[minmax(9rem,14rem)_1fr_4.5rem] items-center gap-3 text-sm">
              <span>{s.label}</span>
              <span className="h-3 overflow-hidden rounded-full bg-subtle">
                <span className={`block h-full rounded-full ${s.color}`} style={{ width: f.created && s.n ? `${Math.max(2, (s.n / f.created) * 100)}%` : "0%" }} />
              </span>
              <span className="text-right tabular-nums"><strong>{s.n}</strong> <span className="text-muted">{pct(s.n)}</span></span>
            </li>
          ))}
        </ol>
        {r.response.no_acceptance_after_48h > 0 && (
          <p className="mt-4 rounded-xl bg-orange-soft px-3 py-2 text-sm text-warning">
            {r.response.no_acceptance_after_48h} open request{r.response.no_acceptance_after_48h === 1 ? " has" : "s have"} had no provider accept for over 48 hours.{" "}
            <Link className="underline" href="/requests">Review requests</Link>
          </p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Breakdown title="Requests by current status" rows={r.requests.by_status} labels={JOB_STATUS_LABELS} color="bg-ios-orange" />
        <Breakdown title="Most requested machines" rows={r.requests.top_machine_types} color="bg-ios-teal" />
        <Breakdown title="Service type" rows={r.requests.by_service_type} labels={SERVICE_TYPE_LABELS} color="bg-ios-purple" />
        <Breakdown title="Urgency" rows={r.requests.by_urgency} labels={URGENCY_LABELS} color="bg-ios-pink" />
        <Breakdown title="Complaints by category" rows={r.complaints.by_category} labels={COMPLAINT_CATEGORY_LABELS} color="bg-ios-red" />
        <Card>
          <h2 className="font-semibold">Complaint handling</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted">Acknowledged within 24 h</dt><dd className="text-xl font-bold text-ios-green">{r.complaints.acknowledged_on_time}</dd></div>
            <div><dt className="text-muted">Acknowledged late or still waiting</dt><dd className="text-xl font-bold text-ios-red">{r.complaints.acknowledged_late}</dd></div>
          </dl>
          <ul className="mt-3 flex flex-wrap gap-1.5 text-xs">
            {r.complaints.by_status.map((c) => (
              <li key={c.key} className="rounded-full bg-subtle px-2.5 py-1">
                {COMPLAINT_STATUS_LABELS[c.key as keyof typeof COMPLAINT_STATUS_LABELS] ?? c.key}: <strong>{c.count}</strong>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm"><Link className="underline" href="/complaints">Open the complaints queue</Link></p>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Providers (all time)</h2>
          <p className="text-sm text-muted">
            Waiting for verification: <Link className="font-semibold text-accent underline" href="/providers?status=submitted">{r.providers.waiting_verification}</Link>
            {" · "}Median review time in this period: <strong>{hours(r.providers.median_hours_to_review)}</strong>
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr><th className="py-2 text-left">Kind</th>{Object.keys(PROVIDER_STATUS_LABELS).map((s) => <th key={s} className="py-2 text-right">{PROVIDER_STATUS_LABELS[s as keyof typeof PROVIDER_STATUS_LABELS]}</th>)}</tr>
            </thead>
            <tbody>
              {Object.keys(KIND_LABELS).map((k) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-2">{KIND_LABELS[k]}</td>
                  {Object.keys(PROVIDER_STATUS_LABELS).map((s) => (
                    <td key={s} className="py-2 text-right tabular-nums">{r.providers.by_kind_status.find((x) => x.kind === k && x.status === s)?.count ?? 0}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number | string; tone: string; hint?: string }) {
  return (
    <Card>
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold tracking-tight tabular-nums ${tone}`}>{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

function Breakdown({ title, rows, labels, color }: { title: string; rows: Count[]; labels?: Record<string, string>; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <h2 className="font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Nothing in this period.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="grid grid-cols-[minmax(7rem,12rem)_1fr_2.5rem] items-center gap-3 text-sm">
              <span className="truncate" title={labels?.[r.key] ?? r.key}>{labels?.[r.key] ?? r.key}</span>
              <span className="h-2.5 overflow-hidden rounded-full bg-subtle">
                <span className={`block h-full rounded-full ${color}`} style={{ width: `${(r.count / max) * 100}%` }} />
              </span>
              <span className="text-right font-semibold tabular-nums">{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
