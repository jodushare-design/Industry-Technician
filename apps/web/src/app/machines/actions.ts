"use server";

import { suggestCatalogueEntry } from "@itm/api";
import { reportError, toAppError, type CatalogueKind } from "@itm/core";
import { getSession } from "@itm/next/server";

export interface SuggestState {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

const KINDS: CatalogueKind[] = ["machine_type", "manufacturer", "model", "component", "spare_part", "fault", "service_skill"];

export async function suggestAction(_prev: SuggestState, form: FormData): Promise<SuggestState> {
  const session = await getSession();
  if (!session) return { error: "Please sign in to send a suggestion." };
  const kind = String(form.get("kind") ?? "") as CatalogueKind;
  if (!KINDS.includes(kind)) return { error: "Choose what you are suggesting." };
  try {
    await suggestCatalogueEntry(session.client, {
      kind,
      name: String(form.get("name") ?? ""),
      details: String(form.get("details") ?? ""),
      manufacturerName: String(form.get("manufacturer") ?? ""),
      modelName: String(form.get("model") ?? ""),
      sourceUrl: String(form.get("sourceUrl") ?? ""),
    });
    return { ok: true };
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where: "web.machines.suggest" });
    return { error: err.userMessage, fieldErrors: err.fieldErrors };
  }
}
