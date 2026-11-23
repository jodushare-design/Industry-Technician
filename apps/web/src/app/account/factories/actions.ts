"use server";

import { removeCustomerMachine, saveCustomerMachine, saveFactory, setFactoryActive, setFactoryLocation } from "@itm/api";
import { formObject, runAction } from "@/lib/action";

const BACK = "/account/factories";

export async function saveFactoryAction(form: FormData) {
  const id = String(form.get("id") ?? "") || undefined;
  await runAction(BACK, "web.factories.save", async ({ client }) => {
    await saveFactory(client, formObject(form) as never, id);
    return id ? "Factory updated." : "Factory added. Now add the machines you have there.";
  });
}

export async function setFactoryActiveAction(form: FormData) {
  await runAction(BACK, "web.factories.active", async ({ client }) => {
    const active = form.get("active") === "true";
    await setFactoryActive(client, String(form.get("id")), active);
    return active ? "Factory restored." : "Factory hidden. Its history is kept.";
  });
}

export async function saveMachineAction(form: FormData) {
  await runAction(`${BACK}#factory-${String(form.get("factoryId"))}`, "web.machines.save", async ({ client }) => {
    await saveCustomerMachine(client, formObject(form) as never);
    return "Machine added.";
  });
}

export async function removeMachineAction(form: FormData) {
  await runAction(BACK, "web.machines.remove", async ({ client }) => {
    await removeCustomerMachine(client, String(form.get("id")));
    return "Machine removed.";
  });
}

export async function setFactoryLocationAction(form: FormData) {
  await runAction(BACK, "web.factories.location", async ({ client }) => {
    const latitude = String(form.get("latitude") ?? "");
    await setFactoryLocation(client, String(form.get("id")), { latitude, longitude: String(form.get("longitude") ?? "") });
    return latitude ? "Factory location saved. Technicians are now matched by real distance." : "Factory location removed.";
  });
}
