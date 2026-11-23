import "server-only";
import { redirect } from "next/navigation";
import { isStaff, type Role } from "@itm/core";
import { getSession, type Session } from "@itm/next/server";

export type StaffSession = Session & { isPlatformAdmin: boolean };

/**
 * Every admin page and action calls this first. Signed-out users go to
 * sign-in; signed-in non-staff get null (pages render "no access").
 * RLS enforces the same rules in the database.
 */
export async function requireStaff(nextPath: string): Promise<StaffSession | null> {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(nextPath)}`);
  if (session.context.profile.account_status !== "active" || !isStaff(session.roles)) return null;
  return { ...session, isPlatformAdmin: session.roles.includes("platform_admin" satisfies Role) };
}
