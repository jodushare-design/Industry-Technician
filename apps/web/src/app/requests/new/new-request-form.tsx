"use client";

import { useActionState, useState } from "react";
import { SERVICE_TYPE_LABELS, SYMPTOM_LABELS, URGENCY_LABELS } from "@itm/core";
import { Alert, TextField, fieldClass, primaryButtonClass } from "@itm/ui";
import { LocationFields } from "@/components/location-fields";
import { createRequestAction, type NewRequestState } from "../actions";

interface Props {
  factories: { id: string; name: string; locality: string; hasLocation: boolean }[];
  myMachines: { id: string; factoryId: string; label: string; detail: string }[];
  industries: { id: string; name: string }[];
  unknownMachine?: { id: string; name: string };
  machineGroups: { label: string; options: { id: string; name: string }[] }[];
  /** Saved machine chosen before opening the form ("Report a problem" on a machine). */
  initialMachineId?: string;
  /** Opened from "Post your issue": posting is the main button. */
  postFirst?: boolean;
}

const legend = "mb-2 text-[17px] font-semibold";
const chip = "flex cursor-pointer items-center gap-2 rounded-full bg-surface px-3.5 py-2 text-sm shadow-card has-[:checked]:bg-blue-soft has-[:checked]:text-accent has-[:checked]:ring-2 has-[:checked]:ring-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent";

/**
 * Quick path: a saved machine is one tap, and everything already known about it
 * (factory, machine type, make, model, industry) is not asked again. The customer
 * only says what is happening and how urgent it is.
 */
export function NewRequestForm({ factories, myMachines, industries, unknownMachine, machineGroups, initialMachineId, postFirst = false }: Props) {
  const [state, action, pending] = useActionState<NewRequestState, FormData>(createRequestAction, {});
  const initial = myMachines.find((m) => m.id === initialMachineId);
  const [factoryId, setFactoryId] = useState(initial?.factoryId ?? factories[0]!.id);
  const machinesHere = myMachines.filter((m) => m.factoryId === factoryId);
  const [machine, setMachine] = useState<string>(
    initial ? `mine:${initial.id}` : machinesHere[0] ? `mine:${machinesHere[0].id}` : unknownMachine ? `type:${unknownMachine.id}` : "",
  );
  const savedChosen = machine.startsWith("mine:");
  const factory = factories.find((f) => f.id === factoryId)!;
  const fe = state.fieldErrors ?? {};

  function changeFactory(id: string) {
    setFactoryId(id);
    const first = myMachines.find((m) => m.factoryId === id);
    setMachine(first ? `mine:${first.id}` : unknownMachine ? `type:${unknownMachine.id}` : "");
  }

  return (
    <form action={action} className="space-y-7">
      <input type="hidden" name="factoryId" value={factoryId} />
      <input type="hidden" name="machine" value={machine} />

      <fieldset>
        <legend className={legend}>1. Which machine?</legend>
        {factories.length > 1 && (
          <select value={factoryId} onChange={(e) => changeFactory(e.target.value)} className={`${fieldClass} mb-3 w-full`} aria-label="Factory">
            {factories.map((f) => <option key={f.id} value={f.id}>{f.name} — {f.locality}</option>)}
          </select>
        )}
        {machinesHere.length > 0 && (
          <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="My machines">
            {machinesHere.map((m) => {
              const on = machine === `mine:${m.id}`;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setMachine(`mine:${m.id}`)}
                  className={`rounded-2xl p-3.5 text-left shadow-card transition ${on ? "bg-blue-soft ring-2 ring-accent" : "bg-surface hover:shadow-raised"}`}
                >
                  <span className="block font-semibold">{m.label}</span>
                  {m.detail && <span className="block text-sm text-muted">{m.detail}</span>}
                </button>
              );
            })}
            <button
              type="button"
              role="radio"
              aria-checked={!savedChosen}
              onClick={() => setMachine(unknownMachine ? `type:${unknownMachine.id}` : machineGroups[0]?.options[0] ? `type:${machineGroups[0].options[0].id}` : "")}
              className={`rounded-2xl p-3.5 text-left shadow-card transition ${!savedChosen ? "bg-blue-soft ring-2 ring-accent" : "bg-surface hover:shadow-raised"}`}
            >
              <span className="block font-semibold">Another machine</span>
              <span className="block text-sm text-muted">Not in my list</span>
            </button>
          </div>
        )}
        {savedChosen ? (
          <p className="mt-2 text-sm text-muted">Machine details are taken from your saved machine — nothing else to fill in here.</p>
        ) : (
          <div className="mt-3 grid gap-3">
            <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
              Machine
              <select value={machine} onChange={(e) => setMachine(e.target.value)} required className={`${fieldClass} font-normal text-foreground`}>
                {unknownMachine && <option value={`type:${unknownMachine.id}`}>{unknownMachine.name}</option>}
                {machineGroups.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => <option key={o.id} value={`type:${o.id}`}>{o.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <details className="text-sm">
              <summary className="cursor-pointer text-accent">Add make, model or industry (optional)</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <TextField id="manufacturerText" name="manufacturerText" label="Make" />
                <TextField id="modelText" name="modelText" label="Model" />
                <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
                  Industry
                  <select name="industryId" defaultValue="" className={`${fieldClass} font-normal text-foreground`}>
                    <option value="">Not sure / other</option>
                    {industries.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </label>
              </div>
            </details>
          </div>
        )}
      </fieldset>

      {!factory.hasLocation && (
        <div key={factory.id} className="rounded-2xl bg-orange-soft p-4">
          <p className="mb-2 text-sm font-semibold">Are you at {factory.name} now? Add its live location so technicians nearby are found.</p>
          <LocationFields latName="factoryLatitude" lngName="factoryLongitude" hint="Optional. Saved to this factory; other users never see it." />
        </div>
      )}

      <fieldset>
        <legend className={legend}>2. What is happening?</legend>
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(SYMPTOM_LABELS).map(([v, l]) => (
            <label key={v} className={chip}>
              <input type="checkbox" name="symptoms" value={v} className="sr-only" /> {l}
            </label>
          ))}
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
          Describe it in a line or two
          <textarea name="description" required minLength={10} maxLength={2000} rows={3} className={`${fieldClass} py-2 font-normal text-foreground`}
            placeholder="e.g. Husker rolls slipping since morning, burning smell." />
          {fe.description && <span className="text-danger" role="alert">{fe.description[0]}</span>}
        </label>
        <p className="mt-1.5 text-sm text-muted">Photos, a short video or a voice note can be added on the next screen.</p>
      </fieldset>

      <fieldset>
        <legend className={legend}>3. How urgent, and what kind of help?</legend>
        <div className="mb-3 flex flex-wrap gap-2">
          {Object.entries(URGENCY_LABELS).map(([v, l]) => (
            <label key={v} className={chip}>
              <input type="radio" name="urgency" value={v} defaultChecked={v === "flexible"} className="sr-only" /> {l}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(SERVICE_TYPE_LABELS).map(([v, l], i) => (
            <label key={v} className={chip}>
              <input type="radio" name="serviceType" value={v} defaultChecked={i === 0} className="sr-only" /> {l}
            </label>
          ))}
        </div>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-accent">Choose a preferred date (optional)</summary>
          <div className="mt-2 max-w-xs"><TextField id="preferredDate" name="preferredDate" label="Preferred date" type="date" /></div>
        </details>
      </fieldset>

      {state.error && <Alert tone="error">{state.fieldErrors ? Object.values(state.fieldErrors).flat().join(" ") : state.error}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={`rounded-2xl p-4 ${postFirst ? "bg-subtle" : "bg-blue-soft"}`}>
          <button type="submit" name="intent" value="find" disabled={pending || !machine}
            className={postFirst ? "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-surface px-5 text-[15px] font-semibold text-accent shadow-sm" : `${primaryButtonClass} w-full`}>
            {pending ? "Saving…" : "Find technicians"}
          </button>
          <p className="mt-2 text-sm text-muted">See technicians who work on this machine near you and choose whom to contact.</p>
        </div>
        <div className={`rounded-2xl p-4 ${postFirst ? "bg-blue-soft" : "bg-subtle"}`}>
          <button type="submit" name="intent" value="post" disabled={pending || !machine}
            className={postFirst ? `${primaryButtonClass} w-full` : "inline-flex min-h-11 w-full items-center justify-center rounded-full bg-surface px-5 text-[15px] font-semibold text-accent shadow-sm"}>
            {pending ? "Saving…" : "Post my issue to all technicians"}
          </button>
          <p className="mt-2 text-sm text-muted">
            Can&apos;t find anyone? Technicians and companies who work on this machine — including farther away — are told and can offer to help.
            They see the problem and your area, not your name or address.
          </p>
        </div>
      </div>
      <p className="text-xs text-muted">You choose whom to contact. You agree the work, price and site arrangements directly with the provider.</p>
    </form>
  );
}
