import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ROLE_LABELS } from "@itm/core";
import { getSession } from "@itm/next/server";
import { Alert, Button, Card, PageHeader } from "@itm/ui";
import { signOutAction } from "./actions";
import { AcceptTermsForm, ChooseRoleForm } from "./forms";

export const metadata: Metadata = { title: "My account" };
// Per-user page: always render at request time, never prerender.
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/account");
  const { context } = session;

  if (context.profile.account_status !== "active") {
    return (
      <Alert tone="error" title="Your account is not active">
        Contact the Grievance Officer if you think this is a mistake.
      </Alert>
    );
  }

  if (context.roles.length === 0) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Welcome" description="Tell us how you will use the platform. You can add another role later." />
        <ChooseRoleForm />
      </div>
    );
  }

  if (context.pending_documents.length > 0) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Please review and accept" description="These documents explain how the marketplace works." />
        <AcceptTermsForm documents={context.pending_documents} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title="My account" description={context.profile.phone ?? undefined} />
      <Card>
        <h2 className="mb-2 font-semibold">Your roles</h2>
        <ul className="space-y-1">
          {context.roles.map((r) => (
            <li key={r.id}>{ROLE_LABELS[r.role]}</li>
          ))}
        </ul>
      </Card>
      <Alert tone="info" title="More coming soon">
        Profiles, machine selection and service requests arrive in the next development phases.
      </Alert>
      <form action={signOutAction}>
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </div>
  );
}
