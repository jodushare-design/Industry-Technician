"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  chatMediaUrl,
  conversationReads,
  getConversationContacts,
  listMessages,
  markConversationRead,
  sendMedia,
  sendText,
  setContactSharing,
  whatsappLink,
  type ConversationContacts,
  type Message,
} from "@itm/api";
import { MEDIA_TYPES, reportError, toAppError } from "@itm/core";
import { getBrowserSupabase } from "@itm/next/browser";
import { Alert } from "@itm/ui";

type Pending = { clientId: string; text?: string; file?: File; state: "sending" | "failed"; error?: string; at: string };

const ACCEPT = [...MEDIA_TYPES.photo, ...MEDIA_TYPES.video, ...MEDIA_TYPES.voice].join(",");
const time = (iso: string) => new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export interface ChatProps {
  conversationId: string;
  myUserId: string;
  mySide: "customer" | "provider";
  open: boolean;
  reference: string;
  otherName: string;
  /** Where an estimate / parts card links to. */
  cardHref?: (kind: "estimate_card" | "parts_card", refId: string) => string;
}

export function Chat({ conversationId, myUserId, mySide, open, reference, otherName, cardHref }: ChatProps) {
  const supabase = getBrowserSupabase();
  const [messages, setMessages] = useState<Message[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<Pending[]>([]);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const resolveUrls = useCallback(
    async (ms: Message[]) => {
      const media = ms.filter((m) => m.storage_path && !urls[m.id]);
      if (!media.length) return;
      const pairs = await Promise.all(media.map(async (m) => [m.id, await chatMediaUrl(supabase, m.storage_path!)] as const));
      setUrls((u) => ({ ...u, ...Object.fromEntries(pairs.filter(([, v]) => v) as [string, string][]) }));
    },
    [supabase, urls],
  );

  const refresh = useCallback(async () => {
    try {
      const ms = await listMessages(supabase, conversationId);
      setMessages(ms);
      void resolveUrls(ms);
      const reads = await conversationReads(supabase, conversationId);
      const others = reads.filter((r) => r.user_id !== myUserId).map((r) => r.last_read_at).sort();
      setOtherReadAt(others.at(-1) ?? null);
      await markConversationRead(supabase, conversationId);
      setLoadError(null);
    } catch (e) {
      setLoadError(toAppError(e).userMessage);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, myUserId, supabase]);

  useEffect(() => {
    void refresh();
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${conversationId}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]));
        setPending((ps) => ps.filter((p) => p.clientId !== m.client_id));
        void resolveUrls([m]);
        if (m.sender_id !== myUserId) void markConversationRead(supabase, conversationId);
      })
      .subscribe();
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    const poll = setInterval(() => void refresh(), 30_000); // fallback if realtime is unavailable
    return () => {
      void supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      clearInterval(poll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [messages.length, pending.length]);

  async function deliver(p: Pending) {
    setPending((ps) => [...ps.filter((x) => x.clientId !== p.clientId), { ...p, state: "sending", error: undefined }]);
    try {
      if (p.file) await sendMedia(supabase, conversationId, { body: p.file, mimeType: p.file.type, sizeBytes: p.file.size }, p.clientId);
      else await sendText(supabase, conversationId, p.text ?? "", p.clientId);
      await refresh();
      setPending((ps) => ps.filter((x) => x.clientId !== p.clientId));
    } catch (e) {
      const err = toAppError(e);
      reportError(err, { where: "web.chat.send" });
      setPending((ps) => ps.map((x) => (x.clientId === p.clientId ? { ...x, state: "failed", error: err.userMessage } : x)));
    }
  }

  function onSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    void deliver({ clientId: crypto.randomUUID(), text, state: "sending", at: new Date().toISOString() });
    setText("");
  }

  async function toggleRecording() {
    if (recording) return recorder.current?.stop();
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
        void deliver({ clientId: crypto.randomUUID(), file: new File(chunks, "voice-note", { type }), state: "sending", at: new Date().toISOString() });
      };
      recorder.current = rec;
      rec.start();
      setRecording(true);
      setTimeout(() => rec.state === "recording" && rec.stop(), 120_000);
    } catch {
      setLoadError("Microphone not available.");
    }
  }

  const otherSideLabel = mySide === "customer" ? otherName : "Customer";

  return (
    <div className="flex flex-col rounded-lg border border-line bg-surface">
      <div className="max-h-[28rem] min-h-48 space-y-2 overflow-y-auto p-3" aria-live="polite" aria-label="Messages">
        {loadError && <Alert tone="error">{loadError}</Alert>}
        {messages.map((m) => {
          if (m.kind === "system") {
            return <p key={m.id} className="text-center text-xs text-muted">{m.body} · {time(m.created_at)}</p>;
          }
          const mine = m.sender_id === myUserId;
          const sameSide = m.sender_side === mySide;
          const read = mine && otherReadAt !== null && otherReadAt >= m.created_at;
          return (
            <div key={m.id} className={`flex ${sameSide ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${sameSide ? "bg-accent text-on-accent" : "bg-subtle"}`}>
                {!sameSide && <p className="text-xs font-semibold opacity-80">{otherSideLabel}</p>}
                {sameSide && !mine && <p className="text-xs font-semibold opacity-80">Your colleague</p>}
                {m.kind === "text" && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                {m.kind === "photo" && (urls[m.id]
                  // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL
                  ? <a href={urls[m.id]} target="_blank" rel="noopener noreferrer"><img src={urls[m.id]} alt="Photo" className="max-h-60 rounded" loading="lazy" /></a>
                  : <p>Photo…</p>)}
                {m.kind === "video" && (urls[m.id] ? <video src={urls[m.id]} controls preload="metadata" className="max-h-60 rounded" /> : <p>Video…</p>)}
                {m.kind === "voice" && (urls[m.id] ? <audio src={urls[m.id]} controls preload="none" /> : <p>Voice note…</p>)}
                {(m.kind === "estimate_card" || m.kind === "parts_card") && (
                  <div className="rounded border border-current/30 p-2">
                    <p className="font-semibold">{m.kind === "estimate_card" ? "Estimate" : "Spare part"}</p>
                    <p>{m.body}</p>
                    {cardHref && m.ref_id && <a className="underline" href={cardHref(m.kind, m.ref_id)}>Open</a>}
                  </div>
                )}
                <p className="mt-1 text-right text-[11px] opacity-75">{time(m.created_at)}{mine && (read ? " · Read" : " · Sent")}</p>
              </div>
            </div>
          );
        })}
        {pending.map((p) => (
          <div key={p.clientId} className="flex justify-end">
            <div className="max-w-[85%] rounded-lg border border-dashed border-line px-3 py-2 text-sm">
              <p className="whitespace-pre-wrap">{p.text ?? (p.file ? `${p.file.type.startsWith("audio") ? "Voice note" : p.file.name}` : "")}</p>
              {p.state === "sending" && <p className="text-xs text-muted">Sending…</p>}
              {p.state === "failed" && (
                <p className="text-xs text-danger">
                  Not sent: {p.error} <button type="button" className="underline" onClick={() => void deliver(p)}>Retry</button>{" "}
                  <button type="button" className="underline" onClick={() => setPending((ps) => ps.filter((x) => x.clientId !== p.clientId))}>Discard</button>
                </p>
              )}
            </div>
          </div>
        ))}
        {messages.length === 0 && pending.length === 0 && !loadError && <p className="text-sm text-muted">No messages yet.</p>}
        <div ref={bottom} />
      </div>

      {open ? (
        <form onSubmit={onSend} className="flex flex-wrap items-end gap-2 border-t border-line p-3">
          <label className="sr-only" htmlFor={`msg-${conversationId}`}>Message</label>
          <textarea
            id={`msg-${conversationId}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(e); } }}
            rows={2}
            maxLength={4000}
            placeholder="Write a message"
            className="min-h-11 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-base"
          />
          <label className="inline-flex min-h-11 cursor-pointer items-center rounded-md border border-line px-3 text-sm hover:bg-subtle" title="Photo or video">
            Attach
            <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void deliver({ clientId: crypto.randomUUID(), file: f, state: "sending", at: new Date().toISOString() });
              e.target.value = "";
            }} />
          </label>
          <button type="button" onClick={toggleRecording} aria-pressed={recording} className="min-h-11 rounded-md border border-line px-3 text-sm hover:bg-subtle">
            {recording ? "Stop & send" : "Voice"}
          </button>
          <button type="submit" className="min-h-11 rounded-md bg-accent px-4 text-sm font-semibold text-on-accent hover:bg-accent-strong">Send</button>
        </form>
      ) : (
        <p className="border-t border-line p-3 text-sm text-muted">This conversation is closed. You can still read it.</p>
      )}
      <ContactSharing conversationId={conversationId} mySide={mySide} open={open} reference={reference} />
    </div>
  );
}

/** Optional phone/WhatsApp hand-off — only when both sides agree. */
function ContactSharing({ conversationId, mySide, open, reference }: { conversationId: string; mySide: "customer" | "provider"; open: boolean; reference: string }) {
  const supabase = getBrowserSupabase();
  const [c, setC] = useState<ConversationContacts | null>(null);
  const [includeRef, setIncludeRef] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setC(await getConversationContacts(supabase, conversationId));
    } catch (e) {
      setError(toAppError(e).userMessage);
    }
  }, [conversationId, supabase]);
  useEffect(() => void load(), [load]);

  if (!c) return null;
  const mine = mySide === "customer" ? c.customer_consented : c.provider_consented;
  const theirs = mySide === "customer" ? c.provider_consented : c.customer_consented;
  const otherPhone = mySide === "customer" ? c.provider_phone : c.customer_phone;

  async function toggle(consent: boolean) {
    setBusy(true);
    setError(null);
    try {
      await setContactSharing(supabase, conversationId, consent);
      await load();
    } catch (e) {
      setError(toAppError(e).userMessage);
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="border-t border-line p-3 text-sm">
      <summary className="cursor-pointer font-medium">Phone / WhatsApp (optional)</summary>
      <div className="mt-2 space-y-2">
        <p className="text-muted">
          Phone numbers are shared only if you both agree. Estimates and approvals made by phone or WhatsApp are not recorded —
          please approve in this app.
        </p>
        {error && <Alert tone="error">{error}</Alert>}
        {c.shared && otherPhone ? (
          <div className="space-y-2">
            <p>Their number: <a className="underline" href={`tel:${otherPhone}`}>{otherPhone}</a></p>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={includeRef} onChange={(e) => setIncludeRef(e.target.checked)} /> Mention request {reference} in the first WhatsApp message
            </label>
            <a className="inline-flex min-h-10 items-center rounded-md border border-line px-3 hover:bg-subtle" href={whatsappLink(otherPhone, includeRef ? reference : undefined)} target="_blank" rel="noopener noreferrer">
              Open WhatsApp
            </a>
            <Alert tone="warning">Reminder: send estimates and give approvals in this app so there is a record.</Alert>
          </div>
        ) : (
          <p>{mine ? (theirs ? "" : "You agreed. Waiting for the other side.") : theirs ? "The other side has agreed to share numbers." : "Neither side has agreed yet."}</p>
        )}
        {open && (
          <button type="button" disabled={busy} onClick={() => void toggle(!mine)} className="min-h-10 rounded-md border border-line px-3 hover:bg-subtle">
            {mine ? "Stop sharing my number" : "Agree to share my number"}
          </button>
        )}
      </div>
    </details>
  );
}
