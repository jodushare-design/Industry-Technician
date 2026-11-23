import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { COMPLAINT_CATEGORY_LABELS, COMPLAINT_STATUS_LABELS } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Card, Flash, PageHeader, StatusPill, primaryButtonClass } from "@itm/ui";

export const metadata: Metadata = { title: "Complaints" };
export const dynamic = "force-dynamic";

export default async function ComplaintsPage({ searchParams }: PageProps<"/complaints">) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/complaints");
  const sp = await searchParams;
  const { data } = await session.client.from("complaints").select("id, reference, category, status, created_at, request_id").order("created_at", { ascending: false });
  const officer = process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_NAME;
  const email = process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER_EMAIL;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Complaints" description="We acknowledge every complaint within 24 hours and aim to resolve it within 15 days." />
        <Link href="/complaints/new" className={`${primaryButtonClass} inline-flex items-center`}>Make a complaint</Link>
      </div>
      <Flash notice={sp.notice} error={sp.error} />
      {(data ?? []).length === 0 ? (
        <Card><p className="text-muted">You have no complaints.</p></Card>
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((c) => (
            <li key={c.id}>
              <Link href={`/complaints/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-surface p-4 hover:border-accent">
                <span><span className="font-semibold">{c.reference}</span> · {COMPLAINT_CATEGORY_LABELS[c.category]}</span>
                <StatusPill tone={c.status === "resolved" || c.status === "closed" ? "success" : "warning"}>{COMPLAINT_STATUS_LABELS[c.status]}</StatusPill>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted">
        Grievance Officer: {officer || "[to be appointed]"}{email ? ` — ${email}` : ""}. <Link className="underline" href="/legal/grievance_policy">Grievance policy</Link>
      </p>
    </div>
  );
}
