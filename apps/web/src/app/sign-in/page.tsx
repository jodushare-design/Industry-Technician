import type { Metadata } from "next";
import { Alert, PageHeader } from "@itm/ui";
import { isSupabaseConfigured } from "@itm/next/env";
import { safeNextPath } from "@itm/next/safe-next";
import { SignInForm } from "@itm/next/sign-in-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);

  return (
    <div className="mx-auto max-w-md">
      <PageHeader title="Sign in or create an account" description="We'll send a 6-digit code to your mobile number." />
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
