import type { Metadata } from "next";
import Link from "next/link";
import { isRateLimit, listPlatformSettings } from "@itm/api";
import { Alert, Card, Flash, PageHeader, fieldClass, smallButtonClass } from "@itm/ui";
import { requireStaff } from "@/lib/dal";
import { NoAccess } from "../no-access";
import { saveRateLimitAction } from "./actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/** Show a window in the largest whole unit. */
function splitWindow(seconds: number): { value: number; unit: "seconds" | "minutes" | "hours" | "days" } {
  if (seconds % 86400 === 0) return { value: seconds / 86400, unit: "days" };
  if (seconds % 3600 === 0) return { value: seconds / 3600, unit: "hours" };
  if (seconds % 60 === 0) return { value: seconds / 60, unit: "minutes" };
  return { value: seconds, unit: "seconds" };
}

const per = (w: ReturnType<typeof splitWindow>) => (w.value === 1 ? w.unit.replace(/s$/, "") : `${w.value} ${w.unit}`);

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const session = await requireStaff("/settings");
  if (!session) return <NoAccess />;
  const sp = await searchParams;
  const settings = await listPlatformSettings(session.client);
  const limits = settings.filter((s) => s.key.startsWith("rate_limit.") && isRateLimit(s.value));
  const canEdit = session.isPlatformAdmin;

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Platform-wide limits. Every change is checked by the database and written to the audit log." />
      <Flash notice={sp.notice} error={sp.error} />
      {!canEdit && <Alert tone="info">You can view settings. Only a platform administrator can change them.</Alert>}

      <section className="space-y-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Rate limits</h2>
          <p className="text-sm text-muted">
            Protect people from spam and the platform from abuse. Each limit counts actions by one signed-in account within the time window.
            Phone sign-in codes are limited separately by the authentication service.
          </p>
        </div>
        <ul className="grid gap-3 lg:grid-cols-2">
          {limits.map((s) => {
            const v = s.value as { max: number; window_seconds: number };
            const w = splitWindow(v.window_seconds);
            return (
              <li key={s.key}>
                <Card className="h-full">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{s.label}</h3>
                      <p className="mt-0.5 text-sm text-muted">{s.description}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-soft px-3 py-1 text-sm font-semibold text-accent">
                      {v.max} per {per(w)}
                    </span>
                  </div>
                  {canEdit && (
                    <form action={saveRateLimitAction} className="mt-4 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="key" value={s.key} />
                      <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
                        Maximum
                        <input name="max" type="number" min={1} max={10000} required defaultValue={v.max} className={`${fieldClass} w-28 text-foreground`} />
                      </label>
                      <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
                        per
                        <input name="window" type="number" min={1} required defaultValue={w.value} className={`${fieldClass} w-24 text-foreground`} />
                      </label>
                      <label className="flex flex-col gap-1 text-[13px] font-medium text-muted">
                        <span className="sr-only">Unit</span>
                        <select name="unit" defaultValue={w.unit} className={`${fieldClass} text-foreground`}>
                          <option value="seconds">seconds</option>
                          <option value="minutes">minutes</option>
                          <option value="hours">hours</option>
                          <option value="days">days</option>
                        </select>
                      </label>
                      <button className={smallButtonClass}>Save</button>
                    </form>
                  )}
                  <p className="mt-3 text-xs text-muted">
                    Last changed {new Date(s.updated_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </p>
                </Card>
              </li>
            );
          })}
        </ul>
      </section>

      <Card>
        <h2 className="font-semibold">Set elsewhere</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Grievance officer name and contact: environment settings of the website and app (see docs/setup.md), shown on every legal page.</li>
          <li>Complaint deadlines (acknowledge within 24 hours, resolve within 15 days): fixed by the grievance policy draft until legal review.</li>
          <li>Staff accounts and roles: <Link className="underline" href="/users">Users &amp; roles</Link>.</li>
          <li>Upload size and file types: fixed per storage bucket in the database migrations.</li>
        </ul>
      </Card>
    </div>
  );
}
