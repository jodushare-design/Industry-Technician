"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { uploadProviderDocument } from "@itm/api";
import { ALLOWED_UPLOAD_TYPES, DOCUMENT_TYPES, MAX_UPLOAD_BYTES, reportError, toAppError, type ProviderDocumentType } from "@itm/core";
import { getBrowserSupabase } from "@itm/next/browser";
import { Alert, Button, TextField, fieldClass } from "@itm/ui";

/**
 * Uploads straight from the browser to private storage (the user's own
 * session; RLS checks the folder), then registers the document.
 */
export function DocumentUploader({ profileId, allowedTypes }: { profileId: string; allowedTypes: ProviderDocumentType[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [docType, setDocType] = useState<ProviderDocumentType>(allowedTypes[0]!);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    setError(null);
    setDone(null);
    if (!(file instanceof File) || file.size === 0) return setError("Choose a file.");
    if (!(ALLOWED_UPLOAD_TYPES as readonly string[]).includes(file.type)) return setError("Upload a PDF, JPG, PNG or WebP file.");
    if (file.size > MAX_UPLOAD_BYTES) return setError("Files must be 10 MB or smaller.");
    setBusy(true);
    try {
      await uploadProviderDocument(
        getBrowserSupabase(),
        profileId,
        { body: file, mimeType: file.type, sizeBytes: file.size },
        {
          docType,
          title: String(data.get("title") ?? ""),
          issuer: String(data.get("issuer") ?? "") || undefined,
          validUntil: String(data.get("validUntil") ?? "") || undefined,
        },
      );
      form.reset();
      setDone("Uploaded. It will be reviewed with your profile.");
      router.refresh();
    } catch (err) {
      const appErr = toAppError(err);
      reportError(appErr, { where: "web.provider.upload" });
      setError(appErr.fieldErrors ? Object.values(appErr.fieldErrors).flat().join(" ") : appErr.userMessage);
    } finally {
      setBusy(false);
    }
  }

  const meta = DOCUMENT_TYPES[docType];
  const needsDates = ["certificate", "licence", "insurance"].includes(docType);

  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
        Document type
        <select value={docType} onChange={(e) => setDocType(e.target.value as ProviderDocumentType)} className={`${fieldClass} font-normal`}>
          {allowedTypes.map((t) => <option key={t} value={t}>{DOCUMENT_TYPES[t].label}</option>)}
        </select>
        <span className="font-normal text-muted">{meta.hint}</span>
      </label>
      <TextField id="doc-title" name="title" label="Title" required placeholder={docType === "certificate" ? "e.g. Colour sorter service training" : ""} />
      {needsDates && <TextField id="doc-issuer" name="issuer" label="Issued by" />}
      {needsDates && <TextField id="doc-valid" name="validUntil" label="Valid until (if it expires)" type="date" />}
      <label className="flex flex-col gap-1 text-sm font-medium sm:col-span-2">
        File (PDF, JPG, PNG or WebP, up to 10 MB)
        <input type="file" name="file" accept={ALLOWED_UPLOAD_TYPES.join(",")} required className={`${fieldClass} py-2 font-normal`} />
      </label>
      {error && <div className="sm:col-span-2"><Alert tone="error">{error}</Alert></div>}
      {done && <div className="sm:col-span-2"><Alert tone="success">{done}</Alert></div>}
      <div className="sm:col-span-2">
        <Button type="submit" disabled={busy}>{busy ? "Uploading…" : "Upload"}</Button>
      </div>
    </form>
  );
}
