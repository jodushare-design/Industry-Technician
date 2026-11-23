"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { reportError, toAppError } from "@itm/core";
import { requireStaff } from "@/lib/dal";

const schema = z.object({
  userId: z.uuid(),
  status: z.enum(["active", "suspended"]),
  reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(500),
});

export interface StatusState {
  error?: string;
  ok?: boolean;
}

/** Suspend or reactivate an account. Platform admins only (also enforced by the DB trigger). */
export async function setAccountStatusAction(_prev: StatusState, form: FormData): Promise<StatusState> {
  const session = await requireStaff("/users");
  if (!session?.isPlatformAdmin) return { error: "Only platform administrators can change account status." };

  const parsed = schema.safeParse({ userId: form.get("userId"), status: form.get("status"), reason: form.get("reason") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  if (parsed.data.userId === session.context.profile.id) return { error: "You cannot change your own status." };

  const { data, error } = await session.client
    .from("profiles")
    .update({ account_status: parsed.data.status, status_reason: parsed.data.reason })
    .eq("id", parsed.data.userId)
    .select("id");
  if (error || !data?.length) {
    const e = toAppError(error ?? { status: 403 });
    reportError(e, { where: "admin.setAccountStatus" });
    return { error: e.userMessage };
  }
  revalidatePath("/users");
  return { ok: true };
}
