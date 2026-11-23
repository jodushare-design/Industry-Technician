import "server-only";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { reportError, toAppError } from "@itm/core";
import { getSession, type Session } from "@itm/next/server";

/** Same-site path under the signed-in areas only. */
export function safeBack(value: unknown, fallback = "/account"): string {
  const v = String(value ?? "");
  return /^\/(account|providers|requests|work)(\/|$|\?)/.test(v) && !v.startsWith("//") ? v : fallback;
}

export function withMessage(path: string, key: "notice" | "error", message: string): string {
  const url = new URL(path, "http://x");
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  url.searchParams.set(key, message.slice(0, 300));
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Run a form action for a signed-in user, then redirect back with a notice or
 * the safe error message. Field errors are flattened into the message.
 */
export async function runAction(back: string, where: string, fn: (session: Session) => Promise<string>): Promise<never> {
  const session = await getSession();
  if (!session) redirect(`/sign-in?next=${encodeURIComponent(back)}`);
  let target: string;
  try {
    target = withMessage(back, "notice", await fn(session));
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where });
    const fields = err.fieldErrors ? Object.values(err.fieldErrors).flat().join(" ") : "";
    target = withMessage(back, "error", fields || err.userMessage);
  }
  revalidatePath("/", "layout");
  redirect(target);
}

/** FormData → plain object; repeated keys become arrays (for multi-selects). */
export function formObject(form: FormData, arrays: string[] = []): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (typeof v !== "string") continue;
    if (arrays.includes(k)) (out[k] as string[] | undefined) ? (out[k] as string[]).push(v) : (out[k] = [v]);
    else out[k] = v;
  }
  for (const k of arrays) out[k] ??= [];
  return out;
}
