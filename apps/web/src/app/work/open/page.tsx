import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { listOpenRequests } from "@itm/api";
import { SERVICE_TYPE_LABELS, SYMPTOM_LABELS, URGENCY_LABELS, isProvider, type Symptom } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Card, Flash, PageHeader, StatusPill, fieldClass, primaryButtonClass } from "@itm/ui";
import { offerAction, withdrawOfferAction } from "./actions";

export const metadata: Metadata = { title: "Open requests" };
export const dynamic = "force-dynamic";

/** Requests customers posted for providers to offer help. Customers then choose whom to contact. */
export default async function OpenRequestsPage({ searchParams }: PageProps<"/work/open">) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/work/open");
  if (!isProvider(session.roles)) redirect("/account");
  const sp = await searchParams;
  const items = await listOpenRequests(session.client);
  const approved = session.context.providers.some((p) => p.status === "approved");

  return (
    <div className="space-y-6">
      <nav className="flex gap-2 text-sm" aria-label="Work">
        <Link href="/work" className="rounded-full bg-subtle px-4 py-1.5 font-semibold">Requests for you</Link>
        <span aria-current="page" className="rounded-full bg-accent px-4 py-1.5 font-semibold text-on-accent">Open requests</span>
      </nav>
      <PageHeader
        title="Open requests"
        description="Customers posted these because they need someone who works on this machine. Offer to help with the ones you can take on — the customer decides whom to contact."
      />
      <Flash notice={sp.notice} error={sp.error} />
      {!approved ? (
        <Card><p className="text-sm">Open requests appear once your profile is approved. <Link className="underline" href="/account">Check your profile</Link>.</p></Card>
      ) : items.length === 0 ? (
        <Card><p className="text-muted">No open requests for your machines and area right now. We&apos;ll notify you when one is posted.</p></Card>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={`${i.request_id}:${i.provider_id}`}>
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[17px] font-semibold">{i.machine_type} · {SERVICE_TYPE_LABELS[i.service_type as keyof typeof SERVICE_TYPE_LABELS]}</span>
                  <span className="flex gap-2">
                    <StatusPill tone={i.urgency === "emergency" ? "danger" : i.urgency === "within_3_days" ? "warning" : "neutral"}>
                      {URGENCY_LABELS[i.urgency as keyof typeof URGENCY_LABELS]}
                    </StatusPill>
                    {i.my_offer === "pending" && <StatusPill tone="info">Offer sent</StatusPill>}
                    {i.my_offer === "declined" && <StatusPill tone="neutral">Customer declined</StatusPill>}
                  </span>
                </div>
                {i.symptoms.length > 0 && <p className="mt-1 text-sm">{i.symptoms.map((s) => SYMPTOM_LABELS[s as Symptom]).join(", ")}</p>}
                <p className="mt-2 text-sm">{i.description}</p>
                <p className="mt-2 text-xs text-muted">
                  {[i.locality, i.district].filter(Boolean).join(", ")}
                  {i.distance_km !== null ? ` · about ${i.distance_km} km from your base` : ""}
                  {i.preferred_date ? ` · preferred ${i.preferred_date}` : ""}
                  {` · posted ${new Date(i.posted_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}`}
                  {items.some((x) => x.provider_id !== i.provider_id) && i.provider_name ? ` · for ${i.provider_name}` : ""}
                </p>
                {i.my_offer === null || i.my_offer === "withdrawn" ? (
                  <form action={offerAction} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="requestId" value={i.request_id} />
                    <input type="hidden" name="providerId" value={i.provider_id} />
                    <label className="flex min-w-60 flex-1 flex-col gap-1 text-[13px] font-medium text-muted">
                      Short note to the customer (optional)
                      <input name="message" maxLength={500} placeholder="e.g. I work on this machine; can visit tomorrow morning." className={`${fieldClass} font-normal text-foreground`} />
                    </label>
                    <button className={primaryButtonClass}>Offer to help</button>
                  </form>
                ) : i.my_offer === "pending" && i.my_offer_id ? (
                  <form action={withdrawOfferAction} className="mt-3">
                    <input type="hidden" name="offerId" value={i.my_offer_id} />
                    <button className="text-sm text-danger underline">Withdraw my offer</button>
                  </form>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted">
        You see the machine, the problem and the area only. The customer&apos;s name, address and contact details are shared after they contact you and you accept.
      </p>
    </div>
  );
}
