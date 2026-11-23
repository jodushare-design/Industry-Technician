"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadRequestMedia } from "@itm/api";
import { MAX_MEDIA_BYTES, MEDIA_TYPES, mediaKindOf, reportError, toAppError } from "@itm/core";
import { getBrowserSupabase } from "@itm/next/browser";
import { Alert } from "@itm/ui";

const ACCEPT = [...MEDIA_TYPES.photo, ...MEDIA_TYPES.video, ...MEDIA_TYPES.voice].join(",");

/**
 * Photos, short videos and voice notes. Uploads go straight to private storage
 * from the browser; a failed upload can be retried without losing the others.
 * Voice notes can also be recorded in the browser.
 */
export function MediaUploader({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<{ name: string; state: "uploading" | "done" | "failed"; error?: string; file: File }[]>([]);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  async function upload(file: File) {
    setItems((xs) => [...xs.filter((x) => x.file !== file), { name: file.name, state: "uploading", file }]);
    try {
      if (!mediaKindOf(file.type)) throw new Error("Unsupported file type. Use JPG/PNG photos, MP4 video or MP3/M4A/AAC/WebM audio.");
      if (file.size > MAX_MEDIA_BYTES) throw new Error("Files must be 50 MB or smaller. Record a shorter video.");
      await uploadRequestMedia(getBrowserSupabase(), requestId, { body: file, mimeType: file.type, sizeBytes: file.size });
      setItems((xs) => xs.map((x) => (x.file === file ? { ...x, state: "done" } : x)));
      router.refresh();
    } catch (e) {
      const err = e instanceof Error && !("code" in e) ? e.message : toAppError(e).userMessage;
      reportError(e, { where: "web.requests.media" });
      setItems((xs) => xs.map((x) => (x.file === file ? { ...x, state: "failed", error: err } : x)));
    }
  }

  async function toggleRecording() {
    if (recording) {
      recorder.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = ["audio/webm", "audio/mp4", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (ev) => chunks.push(ev.data);
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const type = (rec.mimeType || "audio/webm").split(";")[0]!;
        void upload(new File(chunks, `voice-note.${type.split("/")[1]}`, { type }));
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), 120_000); // 2-minute limit
    } catch {
      setWarning("Microphone not available. You can upload an audio file instead.");
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line bg-surface px-4 text-sm font-semibold hover:bg-subtle">
          Add photos or video
          <input type="file" accept={ACCEPT} multiple className="sr-only" onChange={(e) => { Array.from(e.target.files ?? []).forEach((f) => void upload(f)); e.target.value = ""; }} />
        </label>
        <button type="button" onClick={toggleRecording} className="min-h-11 rounded-md border border-line bg-surface px-4 text-sm font-semibold hover:bg-subtle" aria-pressed={recording}>
          {recording ? "Stop and send voice note" : "Record a voice note"}
        </button>
      </div>
      <p className="text-sm text-muted">Up to 20 files, 50 MB each. Avoid filming people or confidential documents.</p>
      {warning && <Alert tone="warning">{warning}</Alert>}
      {items.length > 0 && (
        <ul className="space-y-1 text-sm" aria-live="polite">
          {items.map((x, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <span>{x.name}</span>
              {x.state === "uploading" && <span className="text-muted">uploading…</span>}
              {x.state === "done" && <span className="text-success">added</span>}
              {x.state === "failed" && (
                <>
                  <span className="text-danger">{x.error}</span>
                  <button type="button" className="underline" onClick={() => void upload(x.file)}>Retry</button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
