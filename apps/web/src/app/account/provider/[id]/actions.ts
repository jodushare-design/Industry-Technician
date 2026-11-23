"use server";

import {
  addMakeModelExperience,
  addProviderSkill,
  copyCompanySkillToMember,
  deleteProviderDocument,
  removeMakeModelExperience,
  removeProviderSkill,
  saveCompanyDetails,
  saveProviderDetails,
  saveServiceArea,
  submitProviderProfile,
  updateProviderSkill,
} from "@itm/api";
import type { SkillLevel } from "@itm/types";
import { formObject, runAction } from "@/lib/action";

const back = (form: FormData, hash = "") => `/account/provider/${String(form.get("profileId"))}${hash}`;
const LEVELS: SkillLevel[] = ["basic", "experienced", "expert"];

export async function saveDetailsAction(form: FormData) {
  await runAction(back(form, "#details"), "web.provider.details", async ({ client }) => {
    await saveProviderDetails(client, String(form.get("profileId")), formObject(form, ["languages"]));
    return "Details saved.";
  });
}

export async function saveAreaAction(form: FormData) {
  await runAction(back(form, "#area"), "web.provider.area", async ({ client }) => {
    await saveServiceArea(client, String(form.get("profileId")), formObject(form, ["serviceDistricts"]));
    return "Service area saved.";
  });
}

export async function saveCompanyAction(form: FormData) {
  await runAction(back(form, "#company"), "web.provider.company", async ({ client }) => {
    await saveCompanyDetails(client, String(form.get("profileId")), formObject(form));
    return "Business details saved.";
  });
}

export async function addSkillAction(form: FormData) {
  await runAction(back(form, "#skills"), "web.provider.addSkill", async ({ client }) => {
    await addProviderSkill(client, String(form.get("profileId")), formObject(form));
    return "Added.";
  });
}

export async function updateSkillAction(form: FormData) {
  await runAction(back(form, "#skills"), "web.provider.updateSkill", async ({ client }) => {
    const level = String(form.get("level")) as SkillLevel;
    await updateProviderSkill(client, String(form.get("skillId")), Number(form.get("yearsExperience")), LEVELS.includes(level) ? level : "experienced");
    return "Updated.";
  });
}

export async function removeSkillAction(form: FormData) {
  await runAction(back(form, "#skills"), "web.provider.removeSkill", async ({ client }) => {
    await removeProviderSkill(client, String(form.get("skillId")));
    return "Removed.";
  });
}

export async function addMakeModelAction(form: FormData) {
  await runAction(back(form, "#skills"), "web.provider.addMakeModel", async ({ client }) => {
    await addMakeModelExperience(client, formObject(form));
    return "Make/model experience added.";
  });
}

export async function removeMakeModelAction(form: FormData) {
  await runAction(back(form, "#skills"), "web.provider.removeMakeModel", async ({ client }) => {
    await removeMakeModelExperience(client, String(form.get("id")));
    return "Removed.";
  });
}

export async function copySkillAction(form: FormData) {
  await runAction(back(form, "#skills"), "web.provider.copySkill", async ({ client }) => {
    const level = String(form.get("level")) as SkillLevel;
    await copyCompanySkillToMember(
      client,
      String(form.get("companySkillId")),
      String(form.get("profileId")),
      Number(form.get("yearsExperience")) || 0,
      LEVELS.includes(level) ? level : "experienced",
    );
    return "Copied from the company's skills for this person only.";
  });
}

export async function deleteDocumentAction(form: FormData) {
  await runAction(back(form, "#documents"), "web.provider.deleteDocument", async ({ client }) => {
    await deleteProviderDocument(client, String(form.get("documentId")));
    return "Document deleted.";
  });
}

export async function submitAction(form: FormData) {
  await runAction(back(form), "web.provider.submit", async ({ client }) => {
    await submitProviderProfile(client, String(form.get("profileId")));
    return "Sent for review. We will let you know the outcome.";
  });
}
