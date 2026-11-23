"use client";

import { useState } from "react";
import { fieldClass } from "@itm/ui";
import { cancelAction } from "../actions";

const EXAMPLES = [
  "The machine is working again",
  "Our own staff fixed it",
  "Found a technician elsewhere",
  "Not needed now — postponed",
  "The price was too high for us",
  "No reply in time",
];

/** Cancel a request with a reason: tap an example or write your own. */
export function CancelRequest({ requestId }: { requestId: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <div className="flex justify-center pt-2">
        <button type="button" onClick={() => setOpen(true)}
          className="inline-flex min-h-11 items-center rounded-full bg-red-soft px-5 text-[15px] font-semibold text-danger transition hover:brightness-95 active:scale-[0.98]">
          Cancel this request
        </button>
      </div>
    );
  }

  return (
    <form action={cancelAction} className="space-y-4 rounded-2xl bg-surface p-5 shadow-card">
      <input type="hidden" name="requestId" value={requestId} />
      <div>
        <h2 className="text-lg font-semibold">Cancel this request?</h2>
        <p className="text-sm text-muted">
          The providers you contacted are told it is cancelled. The request and its messages stay in your history.
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-[13px] font-medium text-muted">Tap a reason, or write your own</legend>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setReason(e)} aria-pressed={reason === e}
              className={`rounded-full px-3.5 py-2 text-sm transition ${reason === e ? "bg-red-soft font-semibold text-danger ring-2 ring-danger" : "bg-subtle hover:brightness-95"}`}>
              {e}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted">
        Reason
        <textarea
          name="reason"
          required
          minLength={3}
          maxLength={500}
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. The machine started working after we cleaned the rollers."
          className={`${fieldClass} min-h-24 py-3 font-normal text-foreground`}
        />
        <span className="self-end text-xs font-normal">{reason.length}/500</span>
      </label>

      <div className="flex flex-wrap gap-3">
        <button disabled={reason.trim().length < 3}
          className="inline-flex min-h-11 items-center rounded-full bg-danger px-5 text-[15px] font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:opacity-40">
          Cancel request
        </button>
        <button type="button" onClick={() => { setOpen(false); setReason(""); }}
          className="inline-flex min-h-11 items-center rounded-full bg-subtle px-5 text-[15px] font-semibold transition hover:brightness-95">
          Keep request
        </button>
      </div>
    </form>
  );
}
