"use client";

import { useActionState } from "react";
import { setAccountStatusAction, type StatusState } from "./actions";

export function StatusForm({ userId, status }: { userId: string; status: string }) {
  const [state, action, pending] = useActionState<StatusState, FormData>(setAccountStatusAction, {});
  const next = status === "active" ? "suspended" : "active";

  return (
    <form action={action} className="flex flex-col gap-1">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="status" value={next} />
      <input
        name="reason"
        placeholder="Reason (recorded)"
        aria-label="Reason"
        className="min-h-9 rounded border border-line bg-surface px-2 text-sm"
        required
        minLength={5}
      />
      <button type="submit" disabled={pending} className="min-h-9 rounded border border-line px-2 text-sm hover:bg-subtle">
        {pending ? "Saving…" : next === "suspended" ? "Suspend" : "Reactivate"}
      </button>
      {state.error && <p className="text-xs text-danger" role="alert">{state.error}</p>}
    </form>
  );
}
