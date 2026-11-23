import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { assignCompanyMember, getRequestForProvider, mediaUrl, respondToInvitation } from "@itm/api";
import { Chat } from "@/components/chat";
import { JOB_STATUS_LABELS, SERVICE_TYPE_LABELS, SYMPTOM_LABELS, URGENCY_LABELS, type Symptom } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Card, Flash, PageHeader, StatusPill, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { runAction } from "@/lib/action";

export const metadata: Metadata = { title: "Request" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function respondAction(form: FormData) {
  "use server";
  const requestId = String(form.get("requestId"));
  await runAction(`/work/${requestId}`, "web.work.respond", async ({ client }) => {
    const accept = form.get("accept") === "true";
    await respondToInvitation(client, String(form.get("invitationId")), accept, String(form.get("reason") ?? ""));
    return accept ? "Accepted. You can now see the full address. Agree the work with the customer before going." : "Declined. Thank you for replying.";
  });
}

async function assignAction(form: FormData) {
  "use server";
  const requestId = String(form.get("requestId"));
  await runAction("/work/" + requestId, "web.work.assign", async ({ client }) => {
    const member = String(form.get("memberId") ?? "");
    await assignCompanyMember(client, String(form.get("invitationId")), member || null);
    return member ? "Employee assigned. They can now see this job and the conversation." : "Assignment removed.";
  });
}

export default async function ProviderRequestPage({ params, searchParams }: PageProps<"/work/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/work/${id}`);
  const sp = await searchParams;
  const r = await getRequestForProvider(session.client, id);
  if (!r) notFound();
  const media = await Promise.all(r.attachments.map(async (a) => ({ ...a, url: await mediaUrl(session.client, a.path) })));
  const myInvitations = r.invitations ?? [];
  const { data: conversations } = await session.client.from("conversations").select("id, provider_profile_id").eq("request_id", id);
  const activeConv = (conversations ?? []).find((c) => c.id === sp.c) ?? (conversations ?? [])[0];
  const activeInv = myInvitations.find((i) => i.provider_id === activeConv?.provider_profile_id);
  // Company admins: employees they can assign to accepted company jobs
  const companyOrgs = session.context.roles.filter((x) => x.role === "company_admin").map((x) => x.organization_id as string);
  const accepted = myInvitations.filter((i) => i.status === "accepted");
  const [{ data: inviteRows }, { data: members }, { data: companies }] = await Promise.all([
    accepted.length
      ? session.client.from("request_invitations").select("id, provider_profile_id, assigned_member_id").in("id", accepted.map((i) => i.id))
      : Promise.resolve({ data: [] as { id: string; provider_profile_id: string; assigned_member_id: string | null }[] }),
    companyOrgs.length
      ? session.client.from("provider_profiles").select("id, display_name, organization_id").eq("kind", "company_member").eq("status", "approved").is("archived_at", null).in("organization_id", companyOrgs)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; organization_id: string | null }[] }),
    companyOrgs.length
      ? session.client.from("provider_profiles").select("id, organization_id").eq("kind", "company").in("organization_id", companyOrgs)
      : Promise.resolve({ data: [] as { id: string; organization_id: string | null }[] }),
  ]);

  return (
    <div className="space-y-6">
      <Link href="/work" className="text-sm underline">← Requests for you</Link>
      <PageHeader
        title={`${r.machine_type} — ${SERVICE_TYPE_LABELS[r.service_type as keyof typeof SERVICE_TYPE_LABELS]}`}
        description={<span className="flex flex-wrap items-center gap-2">{r.reference} · from {r.customer_name} <StatusPill tone="warning">{JOB_STATUS_LABELS[r.status as keyof typeof JOB_STATUS_LABELS]}</StatusPill></span>}
      />
      <Flash notice={sp.notice} error={sp.error} />
      {r.selected_you && <Alert tone="success" title="The customer chose you">Agree the scope, price and site arrangements with them. Your estimate will be recorded here.</Alert>}

      {myInvitations.filter((i) => i.status === "invited").map((i) => (
        <Card key={i.id} className="space-y-3">
          <h2 className="font-semibold">Can you take this on?</h2>
          {i.match_reasons && i.match_reasons.length > 0 && (
            <p className="text-sm text-muted">The customer saw: {i.match_reasons.join(" · ")}</p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <form action={respondAction}>
              <input type="hidden" name="requestId" value={id} />
              <input type="hidden" name="invitationId" value={i.id} />
              <input type="hidden" name="accept" value="true" />
              <button className={primaryButtonClass}>Accept</button>
            </form>
            <form action={respondAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="requestId" value={id} />
              <input type="hidden" name="invitationId" value={i.id} />
              <input type="hidden" name="accept" value="false" />
              <label className="flex flex-col text-sm">Reason (optional)
                <input name="reason" className="min-h-10 rounded-md border border-line bg-surface px-2" />
              </label>
              <button className={smallButtonClass}>Decline</button>
            </form>
          </div>
          <p className="text-xs text-muted">Accepting shares the factory address with you. It does not commit you to a price — you send your own estimate.</p>
        </Card>
      ))}

      <Card>
        <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
          {r.industry && (<><dt className="text-muted">Industry</dt><dd>{r.industry}</dd></>)}
          <dt className="text-muted">Machine</dt><dd>{[r.machine_type, r.manufacturer, r.model, r.machine_label, r.year_installed].filter(Boolean).join(" · ")}</dd>
          <dt className="text-muted">Customer reports</dt><dd>{r.symptoms.map((s) => SYMPTOM_LABELS[s as Symptom]).join(", ") || "—"}</dd>
          <dt className="text-muted">Description</dt><dd className="whitespace-pre-wrap">{r.description}</dd>
          <dt className="text-muted">When</dt><dd>{URGENCY_LABELS[r.urgency as keyof typeof URGENCY_LABELS]}{r.preferred_date ? ` · preferred ${r.preferred_date}` : ""}</dd>
          <dt className="text-muted">Where</dt>
          <dd>
            {r.engaged ? [r.factory_name, r.address_line, r.locality, r.district, r.pincode].filter(Boolean).join(", ") : `${r.locality}${r.district ? `, ${r.district}` : ""} (full address after you accept)`}
          </dd>
        </dl>
        <p className="mt-3 text-xs text-muted">The customer&apos;s description is not a diagnosis. You assess the machine and decide the work and method.</p>
      </Card>

      {(inviteRows ?? []).filter((i) => (companies ?? []).some((c) => c.id === i.provider_profile_id)).map((i) => {
        const org = (companies ?? []).find((c) => c.id === i.provider_profile_id)?.organization_id;
        const team = (members ?? []).filter((m) => m.organization_id === org);
        return (
          <Card key={i.id}>
            <h2 className="mb-2 font-semibold">Assign a technician from your team</h2>
            {team.length === 0 ? (
              <p className="text-sm text-muted">No approved employees yet. Add them on your company&apos;s Team page.</p>
            ) : (
              <form action={assignAction} className="flex flex-wrap items-end gap-2 text-sm">
                <input type="hidden" name="requestId" value={id} />
                <input type="hidden" name="invitationId" value={i.id} />
                <select name="memberId" defaultValue={i.assigned_member_id ?? ""} className="min-h-10 rounded-md border border-line bg-surface px-2" aria-label="Employee">
                  <option value="">— nobody yet —</option>
                  {team.map((m) => <option key={m.id} value={m.id}>{m.display_name}</option>)}
                </select>
                <button className={smallButtonClass}>Save</button>
              </form>
            )}
            <p className="mt-2 text-xs text-muted">The assigned employee sees this job and its conversation. Your company remains responsible for the work.</p>
          </Card>
        );
      })}

      {myInvitations.some((i) => i.status === "accepted") && (
        <Card>
          <h2 className="mb-1 font-semibold">Estimates</h2>
          <p className="mb-2 text-sm text-muted">Prepare and send your estimate. The customer approves it in the app before you start.</p>
          <Link href={"/work/" + id + "/estimates"} className={smallButtonClass + " inline-flex items-center"}>Open estimates</Link>
        </Card>
      )}

      {myInvitations.some((i) => i.status === "accepted") && (
        <Card>
          <h2 className="mb-1 font-semibold">Spare parts</h2>
          <Link href={"/work/" + id + "/parts"} className={smallButtonClass + " inline-flex items-center"}>Open spare parts</Link>
        </Card>
      )}

      {r.selected_you && (
        <Card>
          <h2 className="mb-1 font-semibold">Job progress</h2>
          <Link href={"/work/" + id + "/job"} className={smallButtonClass + " inline-flex items-center"}>Schedule, progress and completion report</Link>
        </Card>
      )}

      {activeConv && (
        <Card>
          <h2 id="chat" className="mb-2 font-semibold">Messages with {r.customer_name}</h2>
          <Chat
            key={activeConv.id}
            conversationId={activeConv.id}
            myUserId={session.context.profile.id}
            mySide="provider"
            open={!!activeInv && ["invited", "accepted"].includes(activeInv.status) && !["closed", "cancelled"].includes(r.status)}
            reference={r.reference}
            otherName={r.customer_name}
            estimateHrefBase={"/work/" + id + "/estimates#rev-"}
            partsHrefBase={"/work/" + id + "/parts#part-"}
          />
        </Card>
      )}

      {media.length > 0 && (
        <Card>
          <h2 className="mb-2 font-semibold">Photos, videos and voice notes</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {media.map((m) => (
              <li key={m.id} className="rounded-md border border-line p-1">
                {m.url && m.kind === "photo" && (
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  <img src={m.url} alt="Photo from the customer" className="aspect-square w-full rounded object-cover" loading="lazy" />
                )}
                {m.url && m.kind === "video" && <video src={m.url} controls preload="metadata" className="aspect-square w-full rounded bg-black" />}
                {m.url && m.kind === "voice" && <audio src={m.url} controls preload="none" className="w-full" />}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
