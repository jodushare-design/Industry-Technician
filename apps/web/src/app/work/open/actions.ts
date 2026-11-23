"use server";

import { offerToHelp, withdrawOffer } from "@itm/api";
import { runAction } from "@/lib/action";

export async function offerAction(form: FormData) {
  await runAction("/work/open", "web.work.offer", async ({ client }) => {
    await offerToHelp(client, String(form.get("requestId")), String(form.get("providerId")), String(form.get("message") ?? ""));
    return "Offer sent. The customer decides whether to contact you; you'll get a notification if they do.";
  });
}

export async function withdrawOfferAction(form: FormData) {
  await runAction("/work/open", "web.work.withdrawOffer", async ({ client }) => {
    await withdrawOffer(client, String(form.get("offerId")));
    return "Offer withdrawn.";
  });
}
