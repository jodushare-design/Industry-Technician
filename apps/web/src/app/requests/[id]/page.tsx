import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProviderPublic, listEstimates, mediaUrl } from "@itm/api";
import { ESTIMATE_KIND_LABELS, ESTIMATE_STATUS_LABELS, INVITATION_STATUS_LABELS, JOB_STATUS_LABELS, SERVICE_TYPE_LABELS, SYMPTOM_LABELS, URGENCY_LABELS, formatInr, toPaise, type Symptom } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Card, Flash, PageHeader, StatusPill, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { MediaUploader } from "@/components/media-uploader";
import { Chat } from "@/components/chat";
import { cancelAction, findProvidersAction, inviteAction, postAction, respondToOfferAction, selectAction, unpostAction, withdrawAction } from "../actions";

export const metadata: Metadata = { title: "Request" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OPEN = ["submitted", "finding_providers", "provider_contacted", "discussion"];
const OFFER_LABELS = { pending: "Waiting for you", invited: "Contacted", declined: "Declined", withdrawn: "Withdrawn by provider" } as const;

export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/requests/${id}`);
  const sp = await searchParams;
  const { client } = session;

  const { data: r } = await client.from("service_requests").select("*").eq("id", id).maybeSingle();
  if (!r) notFound();
  if (r.customer_id !== session.context.profile.id) redirect(`/work/${id}`);

  const [{ data: attachments }, { data: invitations }, { data: matches }, { data: events }, { data: entities }, { data: factory }] = await Promise.all([
    client.from("request_attachments").select("id, kind, storage_path, mime_type").eq("request_id", id).order("created_at"),
    client.from("request_invitations").select("id, provider_profile_id, status, invited_at, responded_at, decline_reason").eq("request_id", id).order("invited_at"),
    client.from("match_results").select("provider_profile_id, rank, reasons, distance_km, created_at").eq("request_id", id).order("created_at", { ascending: false }).order("rank").limit(50),
    client.from("job_status_events").select("to_status, created_at, note").eq("request_id", id).order("id"),
    client.from("catalogue_entities").select("id, name").in("id", [r.machine_type_id, r.industry_id].filter(Boolean) as string[]),
    client.from("factories").select("name, locality").eq("id", r.factory_id).maybeSingle(),
  ]);
  const { data: conversations } = await client.from("conversations").select("id, provider_profile_id").eq("request_id", id);
  const { data: offers } = await client.from("request_offers").select("id, provider_profile_id, message, status, created_at").eq("request_id", id).order("created_at");
  const estimates = await listEstimates(client, id);
  const name = new Map((entities ?? []).map((e) => [e.id, e.name]));

  // latest matching run only
  const latestRun = matches?.[0]?.created_at;
  const latest = (matches ?? []).filter((m) => m.created_at === latestRun).sort((a, b) => a.rank - b.rank);
  const providerIds = [...new Set([...latest.map((m) => m.provider_profile_id), ...(invitations ?? []).map((i) => i.provider_profile_id), ...estimates.map((e) => e.provider_profile_id), ...(offers ?? []).map((o) => o.provider_profile_id)])];
  const publics = await Promise.all(providerIds.map(async (pid) => [pid, await getProviderPublic(client, pid).catch(() => null)] as const));
  const pub = new Map(publics);
  const invitationOf = new Map((invitations ?? []).map((i) => [i.provider_profile_id, i]));
  const media = await Promise.all((attachments ?? []).map(async (a) => ({ ...a, url: await mediaUrl(client, a.storage_path) })));
  const open = OPEN.includes(r.status);
  const canSelect = ["discussion", "estimate_sent", "awaiting_approval"].includes(r.status);
  const activeConv =
    (conversations ?? []).find((c) => c.id === sp.c) ??
    (conversations ?? []).find((c) => c.provider_profile_id === r.selected_provider_id) ??
    (conversations ?? [])[0];
  const activeInvitation = activeConv ? invitationOf.get(activeConv.provider_profile_id) : undefined;

  return (
    <div className="space-y-6">
      <Link href="/requests" className="text-sm underline">← My requests</Link>
      <PageHeader
        title={`${name.get(r.machine_type_id)} — ${SERVICE_TYPE_LABELS[r.service_type]}`}
        description={<span className="flex flex-wrap items-center gap-2">{r.reference} · {factory?.name} <StatusPill tone="warning">{JOB_STATUS_LABELS[r.status]}</StatusPill></span>}
      />
      <Flash notice={sp.notice} error={sp.error} />

      <Card>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {r.industry_id && (<><dt className="text-muted">Industry</dt><dd>{name.get(r.industry_id)}</dd></>)}
          {(r.manufacturer_text || r.model_text) && (<><dt className="text-muted">Make / model</dt><dd>{[r.manufacturer_text, r.model_text].filter(Boolean).join(" ")}</dd></>)}
          <dt className="text-muted">What is happening</dt><dd>{r.symptoms.map((s) => SYMPTOM_LABELS[s as Symptom]).join(", ") || "—"}</dd>
          <dt className="text-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description}</dd>
          <dt className="text-muted">When</dt><dd>{URGENCY_LABELS[r.urgency]}{r.preferred_date ? ` · preferred ${r.preferred_date}` : ""}</dd>
          <dt className="text-muted">Where</dt><dd>{factory?.name}, {factory?.locality} (providers see the exact address only after they accept)</dd>
        </dl>
      </Card>

      <Card>
        <h2 className="mb-2 font-semibold">Photos, videos and voice notes</h2>
        {media.length > 0 && (
          <ul className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {media.map((m) => (
              <li key={m.id} className="rounded-md border border-line p-1">
                {m.url && m.kind === "photo" && (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={m.url} alt="Photo of the machine" className="aspect-square w-full rounded object-cover" loading="lazy" />
                )}
                {m.url && m.kind === "video" && <video src={m.url} controls preload="metadata" className="aspect-square w-full rounded bg-black" />}
                {m.url && m.kind === "voice" && <audio src={m.url} controls preload="none" className="w-full" />}
                {!m.url && <span className="text-xs text-muted">File unavailable</span>}
              </li>
            ))}
          </ul>
        )}
        {open && <MediaUploader requestId={id} />}
      </Card>

      {estimates.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Estimates</h2>
          <ul className="space-y-2">
            {estimates.map((e) => {
              const latest = e.revisions[0];
              if (!latest) return null;
              return (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm">
                  <span>
                    <Link className="font-medium underline" href={"/requests/" + id + "/estimates/" + latest.id}>{e.title}</Link>
                    <span className="text-muted"> · {ESTIMATE_KIND_LABELS[e.kind]} · {pub.get(e.provider_profile_id)?.display_name ?? "Provider"} · revision {latest.revision_no}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{formatInr(toPaise(latest.total))}</span>
                    <StatusPill tone={latest.status === "accepted" ? "success" : latest.status === "sent" ? "warning" : "neutral"}>{ESTIMATE_STATUS_LABELS[latest.status]}</StatusPill>
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {estimates.some((e) => e.revisions.some((v) => v.status === "accepted")) && (
        <Card>
          <h2 className="mb-1 font-semibold">Spare parts</h2>
          <p className="mb-2 text-sm text-muted">Parts are approved separately from the estimate.</p>
          <Link className="underline" href={"/requests/" + id + "/parts"}>Open spare parts</Link>
        </Card>
      )}

      {!["submitted", "finding_providers", "provider_contacted", "discussion", "estimate_sent", "awaiting_approval", "cancelled"].includes(r.status) && (
        <Card>
          <h2 className="mb-1 font-semibold">Job progress</h2>
          <p className="mb-2 text-sm text-muted">Visit, site safety, the provider's completion report and your confirmation.</p>
          <Link className="underline" href={"/requests/" + id + "/job"}>Open job progress</Link>
          {" · "}
          <Link className="underline" href={"/complaints/new?request=" + id}>Make a complaint</Link>
        </Card>
      )}

      {(invitations ?? []).length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Providers you contacted</h2>
          <ul className="space-y-2">
            {(invitations ?? []).map((i) => {
              const p = pub.get(i.provider_profile_id);
              const selected = r.selected_provider_id === i.provider_profile_id;
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm">
                  <span>
                    <Link className="font-medium underline" href={`/providers/${i.provider_profile_id}`}>{p?.display_name ?? "Provider"}</Link>
                    <span className="ml-2"><StatusPill tone={i.status === "accepted" ? "success" : i.status === "invited" ? "warning" : "neutral"}>{INVITATION_STATUS_LABELS[i.status]}</StatusPill></span>
                    {selected && <span className="ml-2 font-semibold text-success">Your chosen provider</span>}
                    {i.decline_reason && <span className="ml-2 text-muted">“{i.decline_reason}”</span>}
                  </span>
                  <span className="flex gap-2">
                    {canSelect && i.status === "accepted" && !selected && (
                      <form action={selectAction}>
                        <input type="hidden" name="requestId" value={id} />
                        <input type="hidden" name="providerId" value={i.provider_profile_id} />
                        <button className={primaryButtonClass}>Choose this provider</button>
                      </form>
                    )}
                    {open && ["invited", "accepted"].includes(i.status) && (
                      <form action={withdrawAction}>
                        <input type="hidden" name="requestId" value={id} />
                        <input type="hidden" name="invitationId" value={i.id} />
                        <button className={smallButtonClass}>Withdraw</button>
                      </form>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {activeConv && (
        <Card>
          <h2 id="chat" className="mb-2 font-semibold">Messages</h2>
          {(conversations ?? []).length > 1 && (
            <nav className="mb-3 flex flex-wrap gap-2 text-sm" aria-label="Conversations">
              {(conversations ?? []).map((c) => (
                <Link
                  key={c.id}
                  href={"/requests/" + id + "?c=" + c.id + "#chat"}
                  aria-current={c.id === activeConv.id ? "page" : undefined}
                  className={"rounded-md border px-3 py-1.5 " + (c.id === activeConv.id ? "border-accent bg-accent text-on-accent" : "border-line")}
                >
                  {pub.get(c.provider_profile_id)?.display_name ?? "Provider"}
                </Link>
              ))}
            </nav>
          )}
          <Chat
            key={activeConv.id}
            conversationId={activeConv.id}
            myUserId={session.context.profile.id}
            mySide="customer"
            open={!!activeInvitation && ["invited", "accepted"].includes(activeInvitation.status) && !["closed", "cancelled"].includes(r.status)}
            reference={r.reference}
            otherName={pub.get(activeConv.provider_profile_id)?.display_name ?? "Provider"}
            estimateHrefBase={"/requests/" + id + "/estimates/"}
            partsHrefBase={"/requests/" + id + "/parts#part-"}
          />
        </Card>
      )}

      {open && (
        <Card>
          <h2 id="providers" className="mb-1 font-semibold">Find a technician</h2>
          <p className="mb-3 text-sm text-muted">
            Ranked by the machines and experience providers state, distance, availability and the checks the platform has done.
            You choose whom to contact — up to 5 at a time.
          </p>
          <form action={findProvidersAction} className="mb-4">
            <input type="hidden" name="requestId" value={id} />
            <button className={latest.length ? smallButtonClass : primaryButtonClass}>{latest.length ? "Refresh the list" : "Find providers"}</button>
          </form>
          <ul className="space-y-3">
            {latest.map((m) => {
              const p = pub.get(m.provider_profile_id);
              if (!p) return null;
              const inv = invitationOf.get(m.provider_profile_id);
              const reasons = (m.reasons as string[]) ?? [];
              return (
                <li key={m.provider_profile_id} className="rounded-md border border-line p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/providers/${m.provider_profile_id}`} className="font-semibold underline">{p.display_name}</Link>
                      <span className="ml-2 text-sm text-muted">{p.kind === "company" ? "Service company" : "Independent service provider"}{p.base_locality ? ` · ${p.base_locality}` : ""}</span>
                    </div>
                    {inv && inv.status !== "withdrawn" ? (
                      <StatusPill tone="neutral">{INVITATION_STATUS_LABELS[inv.status]}</StatusPill>
                    ) : (
                      <form action={inviteAction}>
                        <input type="hidden" name="requestId" value={id} />
                        <input type="hidden" name="providerId" value={m.provider_profile_id} />
                        <button className={primaryButtonClass}>Contact provider</button>
                      </form>
                    )}
                  </div>
                  <p className="mt-1 text-sm font-medium">Why this match</p>
                  <ul className="list-disc pl-5 text-sm text-muted">{reasons.map((x) => <li key={x}>{x}</li>)}</ul>
                </li>
              );
            })}
          </ul>
          {latest.length === 0 && r.status !== "submitted" && !r.posted_at && (
            <p className="mb-3 text-sm text-muted">No provider is listed for this machine within travel distance of your factory yet.</p>
          )}
          {r.posted_at ? (
            <div className="mt-4 rounded-2xl bg-green-soft p-4">
              <p className="font-semibold text-success">Posted for providers</p>
              <p className="mt-1 text-sm">
                Since {new Date(r.posted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}, approved
                providers who work on this kind of machine — including some farther away — can see the machine, the problem and your area (not your
                name or address) and offer to help. You decide whom to contact.
              </p>
              <form action={unpostAction} className="mt-2">
                <input type="hidden" name="requestId" value={id} />
                <button className="text-sm font-semibold text-accent underline">Stop posting</button>
              </form>
            </div>
          ) : (
            <div className={`mt-4 rounded-2xl p-4 ${latest.length === 0 && r.status !== "submitted" ? "bg-orange-soft" : "bg-subtle"}`}>
              <p className="font-semibold">{latest.length === 0 && r.status !== "submitted" ? "Nobody suitable yet? Post this request" : "Want more choice? Post this request"}</p>
              <p className="mt-1 text-sm">
                Providers who work on this kind of machine, including some farther away, will see the machine, the problem and your area — not your
                name or address — and can offer to help. Nothing is shared further until you choose to contact someone.
              </p>
              <form action={postAction} className="mt-3">
                <input type="hidden" name="requestId" value={id} />
                <button className={primaryButtonClass}>Post request to providers</button>
              </form>
            </div>
          )}
        </Card>
      )}

      {(offers ?? []).length > 0 && (
        <Card>
          <h2 id="offers" className="mb-1 font-semibold">Offers to help</h2>
          <p className="mb-3 text-sm text-muted">Providers who saw your posted request. Contact the ones you want to talk to; they see your site details only after they accept.</p>
          <ul className="space-y-3">
            {(offers ?? []).map((o) => {
              const p = pub.get(o.provider_profile_id);
              return (
                <li key={o.id} className="rounded-2xl bg-subtle p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <Link href={`/providers/${o.provider_profile_id}`} className="font-semibold underline">{p?.display_name ?? "Provider"}</Link>
                      <span className="ml-2 text-sm text-muted">{p?.kind === "company" ? "Service company" : "Independent service provider"}{p?.base_locality ? ` · ${p.base_locality}` : ""}</span>
                    </div>
                    {o.status === "pending" ? (
                      <span className="flex gap-2">
                        <form action={respondToOfferAction}>
                          <input type="hidden" name="requestId" value={id} />
                          <input type="hidden" name="offerId" value={o.id} />
                          <input type="hidden" name="accept" value="1" />
                          <button className={primaryButtonClass}>Contact</button>
                        </form>
                        <form action={respondToOfferAction}>
                          <input type="hidden" name="requestId" value={id} />
                          <input type="hidden" name="offerId" value={o.id} />
                          <input type="hidden" name="accept" value="0" />
                          <button className={smallButtonClass}>Decline</button>
                        </form>
                      </span>
                    ) : (
                      <StatusPill tone={o.status === "invited" ? "success" : "neutral"}>{OFFER_LABELS[o.status]}</StatusPill>
                    )}
                  </div>
                  {o.message && <p className="mt-2 text-sm">“{o.message}”</p>}
                  <p className="mt-1 text-xs text-muted">{new Date(o.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}</p>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <details className="text-sm">
        <summary className="cursor-pointer">History</summary>
        <ul className="mt-2 space-y-1">
          {(events ?? []).map((e, i) => (
            <li key={i}>{new Date(e.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} — {JOB_STATUS_LABELS[e.to_status]}{e.note ? ` (${e.note})` : ""}</li>
          ))}
        </ul>
      </details>

      {open && (
        <form action={cancelAction} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="requestId" value={id} />
          <label className="flex flex-col">Cancel this request — reason
            <input name="reason" required minLength={3} className="min-h-10 rounded-md border border-line bg-surface px-2" />
          </label>
          <button className="text-danger underline">Cancel request</button>
        </form>
      )}

      {!open && r.status === "cancelled" && <Alert tone="info">Cancelled: {r.cancel_reason}</Alert>}
    </div>
  );
}
