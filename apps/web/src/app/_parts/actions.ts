"use server";

import { advancePart, createPartRequest, decidePart, setPartCompatibility, submitPartForApproval, updatePartRequest } from "@itm/api";
import { AppError } from "@itm/core";
import type { PartCompatibility, PartStage } from "@itm/types";
import { formObject, runAction } from "@/lib/action";

const back = (form: FormData, part?: string) => `${String(form.get("base"))}${part ? `#part-${part}` : ""}`;
const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const COMPAT: PartCompatibility[] = ["unknown", "confirmed_by_provider", "confirmed_by_supplier", "not_compatible"];
const STAGES: PartStage[] = ["arranged", "received", "installed", "cancelled"];

function checkBase(form: FormData) {
  if (!/^\/(requests|work)\/[0-9a-f-]{36}\/parts$/.test(s(form, "base"))) throw new AppError("validation");
}

export async function createPartAction(form: FormData) {
  checkBase(form);
  await runAction(back(form), "web.parts.create", async ({ client }) => {
    await createPartRequest(client, s(form, "requestId"), s(form, "providerId"), formObject(form) as never);
    return "Part added. Record compatibility, availability and price, then send it for approval.";
  });
}

export async function updatePartAction(form: FormData) {
  checkBase(form);
  const part = s(form, "partId");
  await runAction(back(form, part), "web.parts.update", async ({ client }) => {
    const keys = ["supplier_name", "supplier_contact", "availability", "unit_price", "expected_delivery", "quantity", "part_number"];
    const fields: Record<string, string> = {};
    for (const k of keys) if (form.has(k)) fields[k] = s(form, k);
    await updatePartRequest(client, part, fields);
    return "Saved.";
  });
}

export async function compatibilityAction(form: FormData) {
  checkBase(form);
  const part = s(form, "partId");
  await runAction(back(form, part), "web.parts.compat", async ({ client }) => {
    const st = s(form, "compatibility") as PartCompatibility;
    if (!COMPAT.includes(st)) throw new AppError("validation");
    await setPartCompatibility(client, part, st, s(form, "note"));
    return "Compatibility recorded.";
  });
}

export async function submitPartAction(form: FormData) {
  checkBase(form);
  const part = s(form, "partId");
  await runAction(back(form, part), "web.parts.submit", async ({ client }) => {
    await submitPartForApproval(client, part);
    return "Sent to the customer for approval.";
  });
}

export async function decidePartAction(form: FormData) {
  checkBase(form);
  const part = s(form, "partId");
  await runAction(back(form, part), "web.parts.decide", async ({ client }) => {
    const approve = s(form, "approve") === "true";
    const by = s(form, "arrangedBy");
    await decidePart(client, part, approve, s(form, "hash"), by === "customer" || by === "provider" ? by : undefined, s(form, "note"));
    return approve ? "Part approved. It is recorded separately from the estimate." : "Part not approved.";
  });
}

export async function advancePartAction(form: FormData) {
  checkBase(form);
  const part = s(form, "partId");
  await runAction(back(form, part), "web.parts.advance", async ({ client }) => {
    const st = s(form, "stage") as PartStage;
    if (!STAGES.includes(st)) throw new AppError("validation");
    await advancePart(client, part, st, s(form, "note"));
    return "Updated.";
  });
}
