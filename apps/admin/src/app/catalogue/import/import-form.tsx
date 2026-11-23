"use client";

import { useActionState, useRef } from "react";
import { Alert } from "@itm/ui";
import { importAction, type ImportState } from "../actions";
import { buttonClass, inputClass, secondaryButtonClass } from "../ui";

export function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const r = state.result;

  return (
    <div className="space-y-4">
      <form ref={formRef} action={action} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-4">
        <label className="flex flex-col text-sm">
          File (.csv or .json, up to 5 MB)
          <input type="file" name="file" accept=".csv,.json,text/csv,application/json" required className={inputClass} />
        </label>
        <button type="submit" name="mode" value="check" disabled={pending} className={secondaryButtonClass}>
          {pending ? "Working…" : "Check file"}
        </button>
        <button
          type="submit"
          name="mode"
          value="import"
          disabled={pending || !r || r.dry_run === false || r.errors > 0}
          className={buttonClass}
          title={!r ? "Check the file first" : undefined}
        >
          Import {r && r.dry_run ? `${r.created} new record${r.created === 1 ? "" : "s"}` : ""}
        </button>
      </form>

      {state.error && <Alert tone="error">{state.error}</Alert>}

      {state.problems && state.problems.length > 0 && (
        <Alert tone="error" title={`${state.problems.length} problem${state.problems.length === 1 ? "" : "s"} in ${state.fileName}`}>
          <ul className="mt-1 list-disc pl-5">
            {state.problems.slice(0, 100).map((p, i) => (
              <li key={i}>Row {p.row}{p.key ? ` (${p.key})` : ""}: {p.message}</li>
            ))}
          </ul>
        </Alert>
      )}

      {r && (
        <div className="space-y-3">
          <Alert tone={r.errors > 0 ? "warning" : "success"} title={r.dry_run ? `Check of ${state.fileName} — nothing saved yet` : `Imported ${state.fileName}`}>
            {r.rows} rows · {r.created} new · {r.existing} already present · {r.duplicates} duplicates skipped · {r.errors} errors
            {r.dry_run && r.errors === 0 && " — choose the same file again and press Import to save."}
            {r.dry_run && r.errors > 0 && " — fix the errors before importing."}
            {!r.dry_run && " — new records are waiting for approval on the Records page."}
          </Alert>
          <div className="overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-left text-sm">
              <thead className="bg-subtle">
                <tr>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Key</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">Notes</th>
                </tr>
              </thead>
              <tbody>
                {r.report
                  .filter((x) => x.result !== "created" || x.possible_duplicates)
                  .concat(r.report.filter((x) => x.result === "created" && !x.possible_duplicates).slice(0, 20))
                  .map((x, i) => (
                    <tr key={i} className="border-t border-line">
                      <td className="px-3 py-2">{x.row}</td>
                      <td className="px-3 py-2 font-mono text-xs">{x.key}</td>
                      <td className={`px-3 py-2 ${x.result === "error" ? "text-danger" : x.result === "duplicate" ? "text-warning" : ""}`}>{x.result}</td>
                      <td className="px-3 py-2">
                        {x.message}
                        {x.duplicate_of && ` (existing: ${x.duplicate_of})`}
                        {x.possible_duplicates && `Similar to: ${x.possible_duplicates.map((d) => `${d.name} ${Math.round(d.similarity * 100)}%`).join(", ")}`}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
