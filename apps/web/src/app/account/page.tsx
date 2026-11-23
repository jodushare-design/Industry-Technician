import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PROVIDER_STATUS_LABELS, ROLE_LABELS } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Button, Card, Flash, PageHeader, StatusPill, primaryButtonClass } from "@itm/ui";
import { acceptInviteAction, signOutAction } from "./actions";
import { AcceptTermsForm, ChooseRoleForm, NameForm } from "./forms";

export const metadata: Metadata = { title: "My account" };
// Per-user page: always render at request time, never prerender.
export const dynamic = "force-dynamic";

const STATUS_TONE = { draft: "neutral", submitted: "warning", approved: "success", rejected: "danger", suspended: "danger" } as const;

export default async function AccountPage({ searchParams }: PageProps<"/account">) {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/account");
  const { context } = session;
  const sp = await searchParams;

  if (context.profile.account_status !== "active") {
    return (
      <Alert tone="error" title="Your account is not active">
        Contact the Grievance Officer if you think this is a mistake.
      </Alert>
    );
  }

  // Step 1: name
  if (!context.profile.full_name) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Welcome" description="First, tell us your name." />
        <NameForm defaultName="" defaultEmail={context.profile.email ?? ""} />
      </div>
    );
  }

  const invites = context.invites.length > 0 && (
    <Card className="space-y-3">
      <h2 className="font-semibold">Team invitations</h2>
      {context.invites.map((i) => (
        <form key={i.id} action={acceptInviteAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="inviteId" value={i.id} />
          <span>
            <span className="font-medium">{i.organization_name}</span> invited you to join their team as a technician.
          </span>
          <button className={primaryButtonClass}>Accept</button>
        </form>
      ))}
      <p className="text-sm text-muted">Joining means the company can assign you its jobs. You remain responsible for your own profile and documents.</p>
    </Card>
  );

  // Step 2: role
  if (context.roles.length === 0) {
    return (
      <div className="mx-auto max-w-xl space-y-6">
        <Flash notice={sp.notice} error={sp.error} />
        {invites}
        <PageHeader title={`Welcome, ${context.profile.full_name}`} description="How will you use the platform? You can add another role later." />
        <ChooseRoleForm />
      </div>
    );
  }

  // Step 3: terms
  if (context.pending_documents.length > 0) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Please review and accept" description="These documents explain how the marketplace works." />
        <AcceptTermsForm documents={context.pending_documents} />
      </div>
    );
  }

  const roles = new Set(context.roles.map((r) => r.role));
  const companies = context.providers.filter((p) => p.kind === "company");
  const exclude = [
    ...(roles.has("customer") ? (["customer"] as const) : []),
    ...(roles.has("technician") ? (["technician"] as const) : []),
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`Hello, ${context.profile.full_name}`} description={context.profile.phone ?? undefined} />
      <Flash notice={sp.notice} error={sp.error} />
      {invites}

      {roles.has("customer") && (
        <Card>
          <h2 className="mb-1 font-semibold">Your factories and machines</h2>
          <p className="mb-3 text-sm text-muted">
            {context.factory_count === 0
              ? "Add your factory and the machines there. You'll pick from this list when you ask for help."
              : `${context.factory_count} factor${context.factory_count === 1 ? "y" : "ies"} saved.`}
          </p>
          <Link className={`${primaryButtonClass} inline-flex items-center`} href="/account/factories">
            {context.factory_count === 0 ? "Add your factory" : "Manage factories and machines"}
          </Link>
        </Card>
      )}

      {context.providers.length > 0 && (
        <Card>
          <h2 className="mb-3 font-semibold">Your service provider profiles</h2>
          <ul className="space-y-3">
            {context.providers.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3">
                <span>
                  <span className="font-medium">
                    {p.display_name ?? "Name not set"}
                    {p.kind === "company_member" && p.organization_name ? ` at ${p.organization_name}` : ""}
                  </span>
                  <span className="ml-2 text-sm text-muted">
                    {p.kind === "company" ? "Service company" : p.kind === "company_member" ? "Company technician" : "Independent technician"}
                  </span>
                  <span className="ml-2"><StatusPill tone={STATUS_TONE[p.status]}>{PROVIDER_STATUS_LABELS[p.status]}</StatusPill></span>
                </span>
                <span className="flex gap-2">
                  <Link className="underline" href={`/account/provider/${p.id}`}>Edit profile</Link>
                  {p.kind === "company" && p.organization_id && (
                    <Link className="underline" href={`/account/company/${p.organization_id}`}>Team</Link>
                  )}
                  {p.status === "approved" && <Link className="underline" href={`/providers/${p.id}`}>Public view</Link>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-2 font-semibold">Your roles</h2>
        <ul className="mb-3 flex flex-wrap gap-2 text-sm">
          {context.roles.map((r) => (
            <li key={r.id} className="rounded border border-line px-2 py-0.5">{ROLE_LABELS[r.role]}</li>
          ))}
        </ul>
        <details>
          <summary className="cursor-pointer text-sm underline">Add another role</summary>
          <div className="mt-3 max-w-xl">
            <ChooseRoleForm exclude={[...exclude]} />
          </div>
        </details>
        {companies.length > 0 && <p className="mt-2 text-xs text-muted">You administer {companies.length} compan{companies.length === 1 ? "y" : "ies"}.</p>}
      </Card>

      <form action={signOutAction}>
        <Button type="submit" variant="secondary">Sign out</Button>
      </form>
    </div>
  );
}
