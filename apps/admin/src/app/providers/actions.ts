"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { recordVerificationCheck, reviewProviderDocument, revokeVerificationCheck, setProviderStatus } from "@itm/api";
import { reportError, toAppError } from "@itm/core";
import type { ProviderStatus, VerificationKind } from "@itm/types";
import { requireStaff } from "@/lib/dal";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: VerificationKind[] = ["identity", "business", "certificate", "licence", "insurance"];
const STATUSES: ProviderStatus[] = ["approved", "rejected", "suspended"];

async function run(profileId: string, where: string, fn: (client: NonNullable<Awaited<ReturnType<typeof requireStaff>>>["client"]) => Promise<string>) {
  if (!UUID.test(profileId)) redirect("/providers");
  const back = `/providers/${profileId}`;
  const session = await requireStaff(back);
  const msg = (k: string, v: string) => `${back}?${k}=${encodeURIComponent(v.slice(0, 300))}`;
  if (!session?.isPlatformAdmin) redirect(msg("error", "Only platform administrators can do this."));
  let target: string;
  try {
    target = msg("notice", await fn(session.client));
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where });
    target = msg("error", err.userMessage);
  }
  revalidatePath("/providers", "layout");
  redirect(target);
}

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function recordCheckAction(form: FormData) {
  await run(s(form, "profileId"), "admin.providers.check", async (client) => {
    const kind = s(form, "kind") as VerificationKind;
    if (!KINDS.includes(kind)) throw new Error("Invalid kind");
    await recordVerificationCheck(client, {
      profileId: s(form, "profileId"),
      kind,
      passed: s(form, "result") === "passed",
      label: s(form, "label"),
      validUntil: s(form, "validUntil"),
      documentId: UUID.test(s(form, "documentId")) ? s(form, "documentId") : undefined,
      note: s(form, "note"),
    });
    return "Check recorded.";
  });
}

export async function revokeCheckAction(form: FormData) {
  await run(s(form, "profileId"), "admin.providers.revokeCheck", async (client) => {
    await revokeVerificationCheck(client, s(form, "checkId"), s(form, "reason"));
    return "Check revoked. The badge no longer shows.";
  });
}

export async function reviewDocumentAction(form: FormData) {
  await run(s(form, "profileId"), "admin.providers.reviewDocument", async (client) => {
    await reviewProviderDocument(client, s(form, "documentId"), s(form, "accept") === "true", s(form, "note"));
    return "Document reviewed.";
  });
}

export async function setStatusAction(form: FormData) {
  await run(s(form, "profileId"), "admin.providers.status", async (client) => {
    const status = s(form, "status") as ProviderStatus;
    if (!STATUSES.includes(status)) throw new Error("Invalid status");
    await setProviderStatus(client, s(form, "profileId"), status, s(form, "reason"));
    return `Provider ${status}.`;
  });
}
