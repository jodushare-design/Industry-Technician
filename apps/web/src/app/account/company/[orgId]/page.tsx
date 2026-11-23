import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { inviteCompanyMember, removeCompanyMember, revokeCompanyInvite } from "@itm/api";
import { PROVIDER_STATUS_LABELS } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Card, Flash, PageHeader, StatusPill, TextField, primaryButtonClass, smallButtonClass } from "@itm/ui";
import { formObject, runAction } from "@/lib/action";

export const metadata: Metadata = { title: "Company team" };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function inviteAction(form: FormData) {
  "use server";
  const org = String(form.get("orgId"));
  await runAction(`/account/company/${org}`, "web.company.invite", async ({ client }) => {
    await inviteCompanyMember(client, org, formObject(form));
    return "Invitation saved. Ask them to sign in with that mobile number and accept it.";
  });
}

async function revokeInviteAction(form: FormData) {
  "use server";
  const org = String(form.get("orgId"));
  await runAction(`/account/company/${org}`, "web.company.revokeInvite", async ({ client }) => {
    await revokeCompanyInvite(client, String(form.get("inviteId")));
    return "Invitation cancelled.";
  });
}

async function removeMemberAction(form: FormData) {
  "use server";
  const org = String(form.get("orgId"));
  await runAction(`/account/company/${org}`, "web.company.removeMember", async ({ client }) => {
    await removeCompanyMember(client, String(form.get("memberId")), String(form.get("reason") ?? ""));
    return "Removed from the team. Their past work records are kept.";
  });
}

export default async function CompanyTeamPage({ params, searchParams }: PageProps<"/account/company/[orgId]">) {
  const { orgId } = await params;
  if (!UUID.test(orgId)) notFound();
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=/account/company/${orgId}`);
  if (!session.context.roles.some((r) => r.role === "company_admin" && r.organization_id === orgId)) notFound();
  const sp = await searchParams;
  const { client } = session;

  const [{ data: org }, { data: members }, { data: invites }] = await Promise.all([
    client.from("organizations").select("id, name").eq("id", orgId).maybeSingle(),
    client.from("provider_profiles").select("id, display_name, status, archived_at").eq("organization_id", orgId).eq("kind", "company_member").order("created_at"),
    client.from("organization_invites").select("id, phone, display_name, created_at, accepted_at, revoked_at").eq("organization_id", orgId).order("created_at", { ascending: false }),
  ]);
  if (!org) notFound();
  const current = (members ?? []).filter((m) => !m.archived_at);
  const open = (invites ?? []).filter((i) => !i.accepted_at && !i.revoked_at);

  return (
    <div className="space-y-6">
      <Link href="/account" className="text-sm underline">← My account</Link>
      <PageHeader title={`${org.name}: team`} description="Your employees are employed by your company, not by the platform. Each person keeps their own skills and documents." />
      <Flash notice={sp.notice} error={sp.error} />

      <Card>
        <h2 className="mb-3 font-semibold">Employees</h2>
        {current.length === 0 && <p className="text-sm text-muted">No employees yet. Invite them below.</p>}
        <ul className="space-y-2">
          {current.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3 text-sm">
              <span className="flex items-center gap-2">
                <span className="font-medium">{m.display_name ?? "Name not set"}</span>
                <StatusPill tone={m.status === "approved" ? "success" : m.status === "submitted" ? "warning" : "neutral"}>{PROVIDER_STATUS_LABELS[m.status].split(" —")[0]}</StatusPill>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Link className={smallButtonClass + " inline-flex items-center"} href={`/account/provider/${m.id}`}>Skills and profile</Link>
                <form action={removeMemberAction} className="flex gap-2">
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="memberId" value={m.id} />
                  <input name="reason" required minLength={3} placeholder="Reason" aria-label={`Reason for removing ${m.display_name}`} className="min-h-10 rounded-md border border-line bg-surface px-2" />
                  <button className="text-danger underline">Remove</button>
                </form>
              </span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">Invite an employee</h2>
        <form action={inviteAction} className="grid gap-3 sm:grid-cols-3">
          <input type="hidden" name="orgId" value={orgId} />
          <TextField id="inv-phone" name="phone" label="Their mobile number" type="tel" required />
          <TextField id="inv-name" name="displayName" label="Their name (optional)" />
          <div className="flex items-end"><button className={primaryButtonClass}>Invite</button></div>
        </form>
        <p className="mt-2 text-sm text-muted">They join only after signing in with this number and accepting. We do not send them messages on your behalf.</p>
        {open.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {open.map((i) => (
              <li key={i.id} className="flex items-center gap-2">
                Waiting: {i.display_name ? `${i.display_name} · ` : ""}{i.phone}
                <form action={revokeInviteAction}>
                  <input type="hidden" name="orgId" value={orgId} />
                  <input type="hidden" name="inviteId" value={i.id} />
                  <button className="underline">Cancel</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
