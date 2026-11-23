"use server";

import { redirect } from "next/navigation";
import {
  cancelServiceRequest,
  createServiceRequest,
  inviteProvider,
  matchProviders,
  postServiceRequest,
  respondToOffer,
  unpostServiceRequest,
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
  // Save the customer a step: look for providers straight away.
  let found = -1;
  try {
    found = (await matchProviders(session.client, id)).length;
  } catch (e) {
    reportError(toAppError(e), { where: "web.requests.create.match" });
  }
  const notice =
    found > 0
      ? `Request saved. ${found} provider${found === 1 ? "" : "s"} may suit this job — choose whom to contact below.`
      : found === 0
        ? "Request saved. No provider is listed for this machine near you yet — post the request below so more providers can offer to help."
        : "Request saved. Choose Find providers below.";
  redirect(withMessage(`/requests/${id}`, "notice", notice) + "#providers");
}

const back = (form: FormData) => `/requests/${String(form.get("requestId"))}`;

export async function findProvidersAction(form: FormData) {
  await runAction(`${back(form)}#providers`, "web.requests.match", async ({ client }) => {
    const m = await matchProviders(client, String(form.get("requestId")));
    return m.length
      ? `Found ${m.length} provider${m.length === 1 ? "" : "s"} that may suit this job.`
      : "No provider is listed for this machine near you yet. Post the request so more providers can offer to help.";
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

export async function postAction(form: FormData) {
  await runAction(`${back(form)}#providers`, "web.requests.post", async ({ client }) => {
    const n = await postServiceRequest(client, String(form.get("requestId")));
    return n > 0
      ? `Posted. ${n} provider${n === 1 ? " who works" : "s who work"} on this kind of machine can now see it and offer to help.`
      : "Posted. Providers who work on this kind of machine will see it as they join or update their profiles. We will notify you when someone offers to help.";
  });
}

export async function unpostAction(form: FormData) {
  await runAction(`${back(form)}#providers`, "web.requests.unpost", async ({ client }) => {
    await unpostServiceRequest(client, String(form.get("requestId")));
    return "Posting stopped. Providers can no longer offer to help with this request.";
  });
}

export async function respondToOfferAction(form: FormData) {
  const accept = form.get("accept") === "1";
  await runAction(`${back(form)}#offers`, "web.requests.offer", async ({ client }) => {
    await respondToOffer(client, String(form.get("offerId")), accept);
    return accept ? "Provider contacted. You'll see here when they accept, and you can then chat." : "Offer declined.";
  });
}
