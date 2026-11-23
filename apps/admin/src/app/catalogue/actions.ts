"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  addCatalogueAlias,
  addCatalogueSource,
  importCatalogueRows,
  mergeCatalogueEntities,
  prepareCatalogueImport,
  removeCatalogueAlias,
  resolveCatalogueSuggestion,
  setCatalogueStatus,
  setCatalogueVerification,
  type ImportResult,
} from "@itm/api";
import {
  CATALOGUE_STATUSES,
  CONFIDENCE_LEVELS,
  SOURCE_TYPES,
  VERIFICATION_STATUSES,
  reportError,
  toAppError,
  type RowProblem,
} from "@itm/core";
import type { CatalogueStatus, ConfidenceLevel, SourceType, VerificationStatus } from "@itm/types";
import { requireStaff } from "@/lib/dal";

const str = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Back to a same-site admin path only. */
function safeBack(value: string, fallback: string): string {
  return value.startsWith("/catalogue") && !value.startsWith("//") ? value : fallback;
}

function withMessage(path: string, key: "notice" | "error", message: string): string {
  const url = new URL(path, "http://x");
  url.searchParams.delete("notice");
  url.searchParams.delete("error");
  url.searchParams.set(key, message.slice(0, 300));
  return `${url.pathname}${url.search}`;
}

/**
 * Runs a platform-admin-only catalogue action and redirects back with a
 * notice or error. The database re-checks the role on every call.
 */
async function run(back: string, where: string, fn: (client: Awaited<ReturnType<typeof requireStaff>> & object) => Promise<string>) {
  const session = await requireStaff(back);
  if (!session?.isPlatformAdmin) redirect(withMessage(back, "error", "Only platform administrators can change the catalogue."));
  let target: string;
  try {
    target = withMessage(back, "notice", await fn(session));
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where });
    target = withMessage(back, "error", err.userMessage);
  }
  revalidatePath("/catalogue", "layout");
  redirect(target);
}

export async function bulkStatusAction(form: FormData) {
  const back = safeBack(str(form, "back"), "/catalogue");
  const ids = form.getAll("ids").map(String).filter((id) => UUID.test(id));
  const status = str(form, "status") as CatalogueStatus;
  await run(back, "admin.catalogue.bulkStatus", async ({ client }) => {
    if (!ids.length) return "Nothing selected.";
    if (!(CATALOGUE_STATUSES as readonly string[]).includes(status)) throw new Error("Unknown status");
    const n = await setCatalogueStatus(client, ids, status, str(form, "note"));
    return `${n} record${n === 1 ? "" : "s"} set to ${status.replace("_", " ")}.`;
  });
}

export async function verificationAction(form: FormData) {
  const id = str(form, "id");
  const back = `/catalogue/${id}`;
  await run(back, "admin.catalogue.verification", async ({ client }) => {
    const status = str(form, "verification_status") as VerificationStatus;
    const confidence = (str(form, "confidence") || null) as ConfidenceLevel | null;
    if (!UUID.test(id) || !(VERIFICATION_STATUSES as readonly string[]).includes(status)) throw new Error("Invalid input");
    if (confidence && !(CONFIDENCE_LEVELS as readonly string[]).includes(confidence)) throw new Error("Invalid confidence");
    await setCatalogueVerification(client, id, status, confidence);
    return "Verification updated.";
  });
}

export async function addAliasAction(form: FormData) {
  const id = str(form, "id");
  await run(`/catalogue/${id}`, "admin.catalogue.addAlias", async ({ client }) => {
    const language = str(form, "language") || "en";
    if (!["en", "te", "hi", "ur"].includes(language)) throw new Error("Invalid language");
    await addCatalogueAlias(client, id, str(form, "alias"), language);
    return "Alias added.";
  });
}

export async function removeAliasAction(form: FormData) {
  const id = str(form, "id");
  await run(`/catalogue/${id}`, "admin.catalogue.removeAlias", async ({ client }) => {
    await removeCatalogueAlias(client, str(form, "aliasId"));
    return "Alias removed.";
  });
}

export async function addSourceAction(form: FormData) {
  const id = str(form, "id");
  await run(`/catalogue/${id}`, "admin.catalogue.addSource", async ({ client }) => {
    const sourceType = str(form, "source_type") as SourceType;
    if (!(SOURCE_TYPES as readonly string[]).includes(sourceType)) throw new Error("Invalid source type");
    const confidence = str(form, "confidence") as ConfidenceLevel;
    await addCatalogueSource(client, id, {
      sourceType,
      sourceUrl: str(form, "source_url"),
      sourceOrg: str(form, "source_org"),
      researchDate: str(form, "research_date"),
      verificationDate: str(form, "verification_date"),
      confidence: (CONFIDENCE_LEVELS as readonly string[]).includes(confidence) ? confidence : "low",
      notes: str(form, "notes"),
    });
    return "Source recorded.";
  });
}

export async function mergeAction(form: FormData) {
  const from = str(form, "from");
  const into = str(form, "into");
  await run(`/catalogue/${from}`, "admin.catalogue.merge", async ({ client }) => {
    if (!UUID.test(from) || !UUID.test(into)) throw new Error("Invalid record");
    await mergeCatalogueEntities(client, from, into, str(form, "note"));
    return "Merged. This record now points to the surviving one.";
  });
}

export async function resolveSuggestionAction(form: FormData) {
  await run("/catalogue/suggestions", "admin.catalogue.resolveSuggestion", async ({ client }) => {
    const action = str(form, "action") as "create" | "link" | "reject";
    if (!["create", "link", "reject"].includes(action)) throw new Error("Invalid action");
    const entity = str(form, "entity");
    await resolveCatalogueSuggestion(client, str(form, "id"), action, UUID.test(entity) ? entity : undefined, str(form, "note"));
    return action === "create" ? "Draft record created for review." : action === "link" ? "Marked as already in the catalogue." : "Suggestion rejected.";
  });
}

// ---------------------------------------------------------------- import (stateful form)

export interface ImportState {
  fileName?: string;
  problems?: RowProblem[];
  result?: ImportResult;
  error?: string;
  committed?: boolean;
}

export async function importAction(_prev: ImportState, form: FormData): Promise<ImportState> {
  const session = await requireStaff("/catalogue/import");
  if (!session?.isPlatformAdmin) return { error: "Only platform administrators can import." };

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a .csv or .json file." };
  const dryRun = form.get("mode") !== "import";
  const text = await file.text();
  const prepared = prepareCatalogueImport(file.name, text);
  if (prepared.problems.length > 0) return { fileName: file.name, problems: prepared.problems };
  if (prepared.rows.length === 0) return { fileName: file.name, error: "The file has no rows." };

  try {
    const result = await importCatalogueRows(session.client, prepared.rows, file.name, prepared.format, dryRun);
    if (!dryRun) revalidatePath("/catalogue", "layout");
    return { fileName: file.name, result, committed: !dryRun };
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where: "admin.catalogue.import" });
    return { fileName: file.name, error: err.userMessage };
  }
}
