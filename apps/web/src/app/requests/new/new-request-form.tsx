"use client";

import { useActionState, useState } from "react";
import { SERVICE_TYPE_LABELS, SYMPTOM_LABELS, URGENCY_LABELS } from "@itm/core";
import { Alert, Button, TextField, fieldClass } from "@itm/ui";
import { createRequestAction, type NewRequestState } from "../actions";

interface Props {
  factories: { id: string; name: string; locality: string }[];
  myMachines: { id: string; factoryId: string; label: string }[];
  industries: { id: string; name: string }[];
  unknownMachine?: { id: string; name: string };
  machineGroups: { label: string; options: { id: string; name: string }[] }[];
}

const legend = "mb-2 text-base font-semibold";

export function NewRequestForm({ factories, myMachines, industries, unknownMachine, machineGroups }: Props) {
  const [state, action, pending] = useActionState<NewRequestState, FormData>(createRequestAction, {});
  const [factoryId, setFactoryId] = useState(factories[0]!.id);
  const machinesHere = myMachines.filter((m) => m.factoryId === factoryId);
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="space-y-6">
      <fieldset>
        <legend className={legend}>1. What help do you need?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(SERVICE_TYPE_LABELS).map(([v, l], i) => (
            <label key={v} className="flex items-center gap-2 rounded-md border border-line bg-surface p-3">
              <input type="radio" name="serviceType" value={v} defaultChecked={i === 0} /> {l}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className={legend}>2. Where is the factory?</legend>
        <select name="factoryId" value={factoryId} onChange={(e) => setFactoryId(e.target.value)} className={`${fieldClass} w-full`} aria-label="Factory">
          {factories.map((f) => <option key={f.id} value={f.id}>{f.name} — {f.locality}</option>)}
        </select>
      </fieldset>

      <fieldset>
        <legend className={legend}>3. Which industry and machine?</legend>
        <div className="grid gap-3">
          <label className="flex flex-col gap-1 text-sm font-medium">
            Industry (optional)
            <select name="industryId" defaultValue="" className={`${fieldClass} font-normal`}>
              <option value="">Not sure / other</option>
              {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Machine
            <select name="machine" required defaultValue={machinesHere[0] ? `mine:${machinesHere[0].id}` : unknownMachine ? `type:${unknownMachine.id}` : ""} className={`${fieldClass} font-normal`}>
              {machinesHere.length > 0 && (
                <optgroup label="My machines at this factory">
                  {machinesHere.map((m) => <option key={m.id} value={`mine:${m.id}`}>{m.label}</option>)}
                </optgroup>
              )}
              {unknownMachine && <option value={`type:${unknownMachine.id}`}>{unknownMachine.name}</option>}
              {machineGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => <option key={o.id} value={`type:${o.id}`}>{o.name}</option>)}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField id="manufacturerText" name="manufacturerText" label="Make (if known)" />
            <TextField id="modelText" name="modelText" label="Model (if known)" />
          </div>
        </div>
      </fieldset>

      <fieldset>
        <legend className={legend}>4. What is happening?</legend>
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(SYMPTOM_LABELS).map(([v, l]) => (
            <label key={v} className="flex items-center gap-1 rounded-md border border-line bg-surface px-3 py-2 text-sm">
              <input type="checkbox" name="symptoms" value={v} /> {l}
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Describe it in your own words
          <textarea name="description" required minLength={10} maxLength={2000} rows={4} className={`${fieldClass} py-2 font-normal`}
            placeholder="What you see or hear, since when, anything that was changed recently." />
          {fe.description && <span className="text-danger" role="alert">{fe.description[0]}</span>}
        </label>
        <p className="mt-1 text-sm text-muted">You can add photos, a short video or a voice note on the next screen.</p>
      </fieldset>

      <fieldset>
        <legend className={legend}>5. When do you need help?</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <select name="urgency" defaultValue="flexible" className={fieldClass} aria-label="Urgency">
            {Object.entries(URGENCY_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <TextField id="preferredDate" name="preferredDate" label="Preferred date (optional)" type="date" />
        </div>
      </fieldset>

      {state.error && <Alert tone="error">{state.fieldErrors ? Object.values(state.fieldErrors).flat().join(" ") : state.error}</Alert>}
      <Alert tone="info">
        The providers you contact are independent businesses. They will assess the machine themselves and you agree the work,
        price and site arrangements directly with them.
      </Alert>
      <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Continue"}</Button>
    </form>
  );
}
