"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { acceptCompanyInvite, acceptLegalDocuments, createOrganization, registerRole, signOut, updateMyProfile } from "@itm/api";
import { reportError, toAppError } from "@itm/core";
import { createServerSupabase, getSession } from "@itm/next/server";

export interface ActionState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/account");
  return session;
}

function fail(e: unknown, where: string): ActionState {
  const err = toAppError(e);
  reportError(err, { where });
  return { error: err.userMessage, fieldErrors: err.fieldErrors };
}

/** Choose how you use the platform. Server-side validated; the DB re-checks. */
export async function chooseRoleAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { client } = await requireSession();
  const choice = String(form.get("choice") ?? "");
  try {
    if (choice === "customer" || choice === "technician") {
      await registerRole(client, choice);
    } else if (choice === "company") {
      await createOrganization(client, String(form.get("companyName") ?? ""));
    } else {
      return { error: "Choose one option." };
    }
  } catch (e) {
    return fail(e, "web.account.chooseRole");
  }
  revalidatePath("/account");
  return {};
}

/** Accept every pending document shown on screen (ids are re-checked against the user's pending list). */
export async function acceptTermsAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { client, context } = await requireSession();
  if (form.get("agree") !== "on") return { error: "Tick the box to confirm you have read the documents." };
  const shown = new Set(form.getAll("documentId").map(String));
  const pending = context.pending_documents.filter((d) => shown.has(d.id)).map((d) => d.id);
  if (pending.length !== shown.size) return { error: "The documents changed. Please review them again." };
  try {
    await acceptLegalDocuments(client, pending, "web");
  } catch (e) {
    return fail(e, "web.account.acceptTerms");
  }
  revalidatePath("/account");
  return {};
}

export async function signOutAction(): Promise<void> {
  try {
    await signOut(await createServerSupabase());
  } catch (e) {
    reportError(e, { where: "web.signOut" });
  }
  redirect("/");
}

/** Name and optional email (step 1 for everyone). */
export async function saveNameAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const { client, context } = await requireSession();
  try {
    await updateMyProfile(client, context.profile.id, {
      fullName: String(form.get("fullName") ?? ""),
      email: String(form.get("email") ?? ""),
      preferredLanguage: (String(form.get("preferredLanguage") ?? "en") || "en") as "en",
    });
  } catch (e) {
    return fail(e, "web.account.saveName");
  }
  revalidatePath("/account");
  return {};
}

/** Accept a company's invitation to join its team (matched to this user's verified number). */
export async function acceptInviteAction(form: FormData): Promise<void> {
  const { client } = await requireSession();
  let target = "/account";
  try {
    const profileId = await acceptCompanyInvite(client, String(form.get("inviteId")));
    target = `/account/provider/${profileId}?notice=${encodeURIComponent("You have joined the team. Add your own skills below.")}`;
  } catch (e) {
    target = `/account?error=${encodeURIComponent(fail(e, "web.account.acceptInvite").error ?? "Could not accept")}`;
  }
  revalidatePath("/account");
  redirect(target);
}
