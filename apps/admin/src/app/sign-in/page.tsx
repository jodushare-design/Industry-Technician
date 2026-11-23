import type { Metadata } from "next";
import { Alert, PageHeader } from "@itm/ui";
import { isSupabaseConfigured } from "@itm/next/env";
import { safeNextPath } from "@itm/next/safe-next";
import { SignInForm } from "@itm/next/sign-in-form";

export const metadata: Metadata = { title: "Staff sign-in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const next = safeNextPath((await searchParams).next, "/");
  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Staff sign-in" description="Platform staff only." />
      {isSupabaseConfigured() ? (
        <SignInForm next={next} />
      ) : (
        <Alert tone="warning" title="Sign-in is not set up yet">
          The Supabase project has not been configured for this environment. See docs/setup.md.
        </Alert>
      )}
    </div>
  );
}
