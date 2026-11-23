import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listMyInvitations } from "@itm/api";
import { INVITATION_STATUS_LABELS, JOB_STATUS_LABELS, SERVICE_TYPE_LABELS, SYMPTOM_LABELS, URGENCY_LABELS, isProvider, type Symptom } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Card, Flash, PageHeader, StatusPill } from "@itm/ui";

export const metadata: Metadata = { title: "Requests for you" };
export const dynamic = "force-dynamic";

/** Provider inbox: requests customers sent to profiles this user manages. */
export default async function WorkInboxPage({ searchParams }: PageProps<"/work">) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/work");
  if (!isProvider(session.roles)) redirect("/account");
  const sp = await searchParams;
  const all = sp.show === "all";
  const items = await listMyInvitations(session.client, all);
  const approved = session.context.providers.some((p) => p.status === "approved");

  return (
    <div className="space-y-6">
      <PageHeader title="Requests for you" description="Customers choose whom to contact. Accept the ones you can take on; decline the rest." />
      <Flash notice={sp.notice} error={sp.error} />
      {!approved && (
        <Card><p className="text-sm">Customers can find you once your profile is approved. <Link className="underline" href="/account">Check your profile</Link>.</p></Card>
      )}
      <p className="text-sm">{all ? <Link className="underline" href="/work">Show open only</Link> : <Link className="underline" href="/work?show=all">Show closed too</Link>}</p>
      {items.length === 0 ? (
        <p className="text-muted">No requests right now.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.invitation_id}>
              <Link href={`/work/${i.request_id}`} className="block rounded-lg border border-line bg-surface p-4 hover:border-accent">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">{i.machine_type} · {SERVICE_TYPE_LABELS[i.service_type as keyof typeof SERVICE_TYPE_LABELS]}</span>
                  <span className="flex gap-2">
                    {i.selected_you && <StatusPill tone="success">Customer chose you</StatusPill>}
                    <StatusPill tone={i.status === "invited" ? "warning" : i.status === "accepted" ? "success" : "neutral"}>{INVITATION_STATUS_LABELS[i.status as keyof typeof INVITATION_STATUS_LABELS]}</StatusPill>
                  </span>
                </div>
                <p className="mt-1 text-sm">{i.symptoms.map((s) => SYMPTOM_LABELS[s as Symptom]).join(", ")}</p>
                <p className="mt-1 text-xs text-muted">
                  {i.locality}{i.district ? `, ${i.district}` : ""} · {URGENCY_LABELS[i.urgency as keyof typeof URGENCY_LABELS]} · {JOB_STATUS_LABELS[i.request_status as keyof typeof JOB_STATUS_LABELS]} · for {i.provider_name}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
