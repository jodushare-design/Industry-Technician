"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadComplaintFile, uploadJobPhoto } from "@itm/api";
import { reportError, toAppError } from "@itm/core";
import { getBrowserSupabase } from "@itm/next/browser";

/** Uploads job photos (before/after) or complaint files from the browser, with retry. */
export function SimpleUploader({
  target,
  id,
  phase,
  label,
  accept,
}: {
  target: "job-photo" | "complaint-file";
  id: string;
  phase?: "before" | "after";
  label: string;
  accept: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<{ file?: File; status?: "uploading" | "done" | "failed"; error?: string }>({});

  async function upload(file: File) {
    setState({ file, status: "uploading" });
    try {
      const supabase = getBrowserSupabase();
      const payload = { body: file, mimeType: file.type, sizeBytes: file.size };
      if (target === "job-photo") await uploadJobPhoto(supabase, id, phase ?? "before", payload);
      else await uploadComplaintFile(supabase, id, payload);
      setState({ status: "done" });
      router.refresh();
    } catch (e) {
      const err = toAppError(e);
      reportError(err, { where: `web.upload.${target}` });
      setState({ file, status: "failed", error: err.userMessage });
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="inline-flex min-h-10 cursor-pointer items-center rounded-md border border-line bg-surface px-3 hover:bg-subtle">
        {label}
        <input type="file" accept={accept} className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
      </label>
      {state.status === "uploading" && <span className="text-muted">Uploading…</span>}
      {state.status === "done" && <span className="text-success">Added</span>}
      {state.status === "failed" && (
        <span className="text-danger">
          {state.error} <button type="button" className="underline" onClick={() => state.file && void upload(state.file)}>Retry</button>
        </span>
      )}
    </div>
  );
}
