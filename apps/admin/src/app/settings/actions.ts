"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { setPlatformSetting } from "@itm/api";
import { reportError, toAppError } from "@itm/core";
import { requireStaff } from "@/lib/dal";

const UNITS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 } as const;

const rateLimitSchema = z.object({
  key: z.string().regex(/^rate_limit\.[a-z_]+$/, "Unknown setting"),
  max: z.coerce.number().int("Use a whole number").min(1, "At least 1").max(10000, "At most 10,000"),
  window: z.coerce.number().int("Use a whole number").min(1, "At least 1"),
  unit: z.enum(Object.keys(UNITS) as [keyof typeof UNITS, ...(keyof typeof UNITS)[]]),
});

function back(key: "notice" | "error", message: string): never {
  redirect(`/settings?${new URLSearchParams({ [key]: message.slice(0, 300) })}`);
}

/** Change one rate limit. Platform admins only; the database validates, re-checks the role and audits. */
export async function saveRateLimitAction(form: FormData) {
  const session = await requireStaff("/settings");
  if (!session?.isPlatformAdmin) back("error", "Only platform administrators can change settings.");

  const parsed = rateLimitSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) back("error", parsed.error.issues[0]?.message ?? "Check the values and try again.");
  const { key, max, window, unit } = parsed.data;

  let message: string;
  try {
    await setPlatformSetting(session.client, key, { max, window_seconds: window * UNITS[unit] });
    message = "Setting saved. The change is recorded in the audit log.";
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where: "admin.settings.save" });
    back("error", err.userMessage);
  }
  revalidatePath("/settings");
  back("notice", message);
}
