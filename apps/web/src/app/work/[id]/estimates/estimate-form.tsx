"use client";

import { useState } from "react";
import { AMOUNT_FIELDS, ESTIMATE_KIND_LABELS, estimateTotal, formatInr, type AmountField, type EstimateKind } from "@itm/core";
import { fieldClass, primaryButtonClass, smallButtonClass } from "@itm/ui";

export interface EstimateFormValues {
  inspection_fee: string; visit_charge: string; labour: string; travel: string; parts: string; other_charges: string;
  other_charges_note: string; tax_amount: string; tax_note: string; scope: string; exclusions: string;
  expected_completion: string; valid_until: string; notes: string;
}

/** Estimate builder with a live total. Posts to server actions (save draft / send). */
export function EstimateForm({
  requestId,
  providerId,
  estimateId,
  revisionId,
  kind,
  allowedKinds,
  title,
  initial,
  saveAction,
  sendAction,
  canSend,
}: {
  requestId: string;
  providerId: string;
  estimateId?: string;
  revisionId?: string;
  kind?: EstimateKind;
  allowedKinds: EstimateKind[];
  title?: string;
  initial: EstimateFormValues;
  saveAction: (form: FormData) => Promise<void>;
  sendAction: (form: FormData) => Promise<void>;
  canSend: boolean;
}) {
  const [values, setValues] = useState(initial);
  const [k, setK] = useState<EstimateKind>(kind ?? allowedKinds[0]!);
  const total = estimateTotal(values as Record<AmountField, string>);
  const set = (name: keyof EstimateFormValues) => (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value }));
  const inspection = k === "inspection";

  return (
    <form className="space-y-4">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="providerId" value={providerId} />
      {estimateId && <input type="hidden" name="estimateId" value={estimateId} />}
      {revisionId && <input type="hidden" name="revisionId" value={revisionId} />}
      <input type="hidden" name="kind" value={k} />

      {!estimateId ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">Type of estimate</legend>
          <div className="flex flex-wrap gap-2">
            {allowedKinds.map((x) => (
              <label key={x} className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-sm">
                <input type="radio" name="kindPick" checked={k === x} onChange={() => setK(x)} /> {ESTIMATE_KIND_LABELS[x]}
              </label>
            ))}
          </div>
          {inspection && <p className="mt-1 text-sm text-muted">Inspection only: charge for the visit and inspection. Quote the repair afterwards as a separate estimate.</p>}
        </fieldset>
      ) : (
        <p className="text-sm"><span className="font-semibold">{title}</span> · {ESTIMATE_KIND_LABELS[k]}</p>
      )}
      {!estimateId && (
        <label className="flex flex-col gap-1 text-sm font-medium">
          Title (optional)
          <input name="title" maxLength={120} defaultValue={title} className={`${fieldClass} font-normal`} placeholder={inspection ? "Inspection of husker" : "Husker roll replacement"} />
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {AMOUNT_FIELDS.map(([name, label]) => {
          const disabled = inspection && (name === "labour" || name === "parts");
          return (
            <label key={name} className="flex flex-col gap-1 text-sm font-medium">
              {label} (₹)
              <input
                name={name}
                inputMode="decimal"
                value={disabled ? "0" : values[name]}
                onChange={set(name)}
                disabled={disabled}
                className={`${fieldClass} font-normal`}
              />
            </label>
          );
        })}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Other charges — what for?
          <input name="other_charges_note" value={values.other_charges_note} onChange={set("other_charges_note")} maxLength={200} className={`${fieldClass} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
          Tax note (e.g. GST 18% on labour, if you are registered)
          <input name="tax_note" value={values.tax_note} onChange={set("tax_note")} maxLength={200} className={`${fieldClass} font-normal`} />
        </label>
      </div>
      <p className="text-lg font-semibold" aria-live="polite">Total: {formatInr(total)}</p>

      <label className="flex flex-col gap-1 text-sm font-medium">
        Scope — what you will do
        <textarea name="scope" value={values.scope} onChange={set("scope")} rows={4} maxLength={3000} required className={`${fieldClass} py-2 font-normal`} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Exclusions — what is not included
        <textarea name="exclusions" value={values.exclusions} onChange={set("exclusions")} rows={2} maxLength={2000} className={`${fieldClass} py-2 font-normal`} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Expected completion
          <input name="expected_completion" value={values.expected_completion} onChange={set("expected_completion")} maxLength={200} placeholder="e.g. Same day, or 2 days after parts arrive" className={`${fieldClass} font-normal`} />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium">
          Valid until
          <input name="valid_until" type="date" value={values.valid_until} onChange={set("valid_until")} required className={`${fieldClass} font-normal`} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Notes for the customer (optional)
        <textarea name="notes" value={values.notes} onChange={set("notes")} rows={2} maxLength={1000} className={`${fieldClass} py-2 font-normal`} />
      </label>

      <div className="flex flex-wrap gap-2">
        <button formAction={saveAction} className={smallButtonClass}>Save draft</button>
        {canSend ? (
          <button formAction={sendAction} className={primaryButtonClass}>Send to customer</button>
        ) : (
          <span className="self-center text-sm text-muted">Your company admin sends estimates for your company.</span>
        )}
      </div>
      <p className="text-xs text-muted">
        Once sent, an estimate cannot be edited — send a revision instead. The customer must approve it in the app; a new price is never
        treated as accepted without their approval. No payment is collected by the platform.
      </p>
    </form>
  );
}
