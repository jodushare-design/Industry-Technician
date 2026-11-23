"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import type { MyContext } from "@itm/types";
import { Alert, Button, TextField } from "@itm/ui";
import { acceptTermsAction, chooseRoleAction, type ActionState } from "./actions";

const initial: ActionState = {};

export function ChooseRoleForm() {
  const [state, action, pending] = useActionState(chooseRoleAction, initial);
  const [choice, setChoice] = useState<"customer" | "technician" | "company">("customer");

  const options = [
    { value: "customer", title: "I need a technician", text: "For factories and industrial businesses looking for service providers." },
    { value: "technician", title: "I am an independent technician", text: "Offer your own services. You stay an independent business." },
    { value: "company", title: "I run a service company", text: "Register your company and add your own employees later." },
  ] as const;

  return (
    <form action={action} className="space-y-4">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">How will you use the platform?</legend>
        {options.map((o) => (
          <label key={o.value} className="flex cursor-pointer gap-3 rounded-md border border-line bg-surface p-4 has-[:checked]:border-accent">
            <input type="radio" name="choice" value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} className="mt-1" />
            <span>
              <span className="block font-medium">{o.title}</span>
              <span className="block text-sm text-muted">{o.text}</span>
            </span>
          </label>
        ))}
      </fieldset>
      {choice === "company" && (
        <TextField id="companyName" name="companyName" label="Company name" required error={state.fieldErrors?.name?.[0]} />
      )}
      {state.error && !state.fieldErrors && <Alert tone="error">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </Button>
    </form>
  );
}

export function AcceptTermsForm({ documents }: { documents: MyContext["pending_documents"] }) {
  const [state, action, pending] = useActionState(acceptTermsAction, initial);
  const anyDraft = documents.some((d) => d.review_status !== "approved");

  return (
    <form action={action} className="space-y-4">
      {anyDraft && (
        <Alert tone="warning" title="DRAFT — LEGAL REVIEW REQUIRED">
          These documents are drafts for the pilot and have not yet been reviewed by a lawyer.
        </Alert>
      )}
      <ul className="list-disc space-y-1 pl-5">
        {documents.map((d) => (
          <li key={d.id}>
            <input type="hidden" name="documentId" value={d.id} />
            <Link href={`/legal/${d.code}`} target="_blank" className="underline">
              {d.title}
            </Link>{" "}
            <span className="text-sm text-muted">v{d.version}</span>
          </li>
        ))}
      </ul>
      <label className="flex items-start gap-2">
        <input type="checkbox" name="agree" className="mt-1" />
        <span>I have read and agree to these documents.</span>
      </label>
      {state.error && <Alert tone="error">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Agree and continue"}
      </Button>
    </form>
  );
}
