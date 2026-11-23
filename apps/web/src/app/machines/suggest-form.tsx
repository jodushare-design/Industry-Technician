"use client";

import { useActionState } from "react";
import { Alert, Button, TextField } from "@itm/ui";
import { suggestAction, type SuggestState } from "./actions";

export function SuggestForm({ defaultName }: { defaultName: string }) {
  const [state, action, pending] = useActionState<SuggestState, FormData>(suggestAction, {});

  if (state.ok) {
    return (
      <Alert tone="success" title="Thank you">
        Your suggestion was sent. The catalogue team checks every suggestion against a reliable source before adding it.
      </Alert>
    );
  }

  return (
    <form action={action} className="space-y-3 rounded-lg border border-line bg-surface p-4">
      <label className="flex flex-col gap-1 text-sm font-medium">
        What are you suggesting?
        <select name="kind" defaultValue="machine_type" className="min-h-11 rounded-md border border-line bg-surface px-3 text-base font-normal">
          <option value="machine_type">A machine</option>
          <option value="manufacturer">A manufacturer (make)</option>
          <option value="model">A model</option>
          <option value="component">A component</option>
          <option value="spare_part">A spare part</option>
          <option value="fault">A problem type</option>
          <option value="service_skill">A service skill</option>
        </select>
      </label>
      <TextField id="name" name="name" label="Name" defaultValue={defaultName} required error={state.fieldErrors?.name?.[0]} />
      <TextField id="manufacturer" name="manufacturer" label="Make (if known)" />
      <TextField id="model" name="model" label="Model (if known)" hint="As printed on the machine's name plate." />
      <TextField id="sourceUrl" name="sourceUrl" label="Link to the maker's page (optional)" type="url" placeholder="https://" error={state.fieldErrors?.sourceUrl?.[0]} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Anything else?
        <textarea name="details" maxLength={1000} rows={3} className="rounded-md border border-line bg-surface px-3 py-2 text-base font-normal" />
      </label>
      {state.error && !state.fieldErrors && <Alert tone="error">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Send suggestion"}</Button>
    </form>
  );
}
