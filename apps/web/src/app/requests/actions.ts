"use server";

import { redirect } from "next/navigation";
import {
  cancelServiceRequest,
  createServiceRequest,
  inviteProvider,
  matchProviders,
  selectProvider,
  withdrawInvitation,
} from "@itm/api";
import { reportError, toAppError } from "@itm/core";
import { getSession } from "@itm/next/server";
import { formObject, runAction, withMessage } from "@/lib/action";

export interface NewRequestState {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function createRequestAction(_prev: NewRequestState, form: FormData): Promise<NewRequestState> {
  const session = await getSession();
  if (!session) redirect("/sign-in?next=/requests/new");
  let id: string;
  try {
    const input = formObject(form, ["symptoms"]);
    // "mine:<id>" = one of my machines; "type:<id>" = a catalogue machine type
    const machine = String(input.machine ?? "");
    id = await createServiceRequest(session.client, {
      ...(input as Record<string, string>),
      symptoms: input.symptoms as never,
      customerMachineId: machine.startsWith("mine:") ? machine.slice(5) : "",
      machineTypeId: machine.startsWith("type:") ? machine.slice(5) : "",
    } as never);
  } catch (e) {
    const err = toAppError(e);
    reportError(err, { where: "web.requests.create" });
    return { error: err.userMessage, fieldErrors: err.fieldErrors };
  }
  redirect(withMessage(`/requests/${id}`, "notice", "Request created. Add photos or a voice note, then find providers."));
}

const back = (form: FormData) => `/requests/${String(form.get("requestId"))}`;

export async function findProvidersAction(form: FormData) {
  await runAction(`${back(form)}#providers`, "web.requests.match", async ({ client }) => {
    const m = await matchProviders(client, String(form.get("requestId")));
    return m.length ? `Found ${m.length} provider${m.length === 1 ? "" : "s"} that may suit this job.` : "No matching providers yet. Try again later or contact support.";
  });
}

export async function inviteAction(form: FormData) {
  await runAction(`${back(form)}#providers`, "web.requests.invite", async ({ client }) => {
    await inviteProvider(client, String(form.get("requestId")), String(form.get("providerId")));
    return "Request sent to the provider. You'll see here when they reply.";
  });
}

export async function withdrawAction(form: FormData) {
  await runAction(`${back(form)}#providers`, "web.requests.withdraw", async ({ client }) => {
    await withdrawInvitation(client, String(form.get("invitationId")));
    return "Withdrawn.";
  });
}

export async function selectAction(form: FormData) {
  await runAction(back(form), "web.requests.select", async ({ client }) => {
    await selectProvider(client, String(form.get("requestId")), String(form.get("providerId")));
    return "Provider chosen. Agree the work, price and site arrangements with them; their estimate will appear here.";
  });
}

export async function cancelAction(form: FormData) {
  await runAction(back(form), "web.requests.cancel", async ({ client }) => {
    await cancelServiceRequest(client, String(form.get("requestId")), String(form.get("reason") ?? ""));
    return "Request cancelled. The providers you contacted have been told.";
  });
}
