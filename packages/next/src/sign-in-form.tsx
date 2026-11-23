"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sendOtp, verifyOtp } from "@itm/api";
import { reportError, toAppError, type AppError } from "@itm/core";
import { getBrowserSupabase } from "./browser";
import { Alert, Button, TextField } from "@itm/ui";

type Step = { kind: "phone" } | { kind: "code"; phone: string };

/** Mirrors scripts/demo/seed.mjs (DEMO_ACCOUNTS). Shown only when NEXT_PUBLIC_DEMO_MODE=1. */
const DEMO_ACCOUNTS = [
  { phone: "9000000001", name: "Lakshmi Reddy", role: "Customer · Sri Lakshmi Rice Mill", audience: "web", color: "#FF9500" },
  { phone: "9000000002", name: "Ravi Kumar", role: "Independent technician · huskers, whiteners", audience: "web", color: "#007AFF" },
  { phone: "9000000003", name: "Priya Sharma", role: "Service company admin · Alpha Mill Services", audience: "web", color: "#AF52DE" },
  { phone: "9000000004", name: "Suresh Babu", role: "Company technician · Alpha Mill Services", audience: "web", color: "#5856D6" },
  { phone: "9000000005", name: "Srinivas Rao", role: "Independent technician · colour sorters", audience: "web", color: "#34C759" },
  { phone: "9000000006", name: "Anil Goud", role: "Technician waiting for verification", audience: "web", color: "#FF2D55" },
  { phone: "9000000008", name: "Meena Iyer", role: "Platform support", audience: "admin", color: "#30B0C7" },
  { phone: "9000000009", name: "Arjun Das", role: "Platform administrator", audience: "admin", color: "#FF3B30" },
] as const;

export function SignInForm({ next, audience = "web" }: { next: string; audience?: "web" | "admin" }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "phone" });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      const err = toAppError(e);
      reportError(err, { where: "web.sign-in" });
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function onSendCode(e: FormEvent) {
    e.preventDefault();
    void run(async () => {
      const normalised = await sendOtp(getBrowserSupabase(), phone);
      setStep({ kind: "code", phone: normalised });
    });
  }

  function onVerify(e: FormEvent) {
    e.preventDefault();
    if (step.kind !== "code") return;
    void run(async () => {
      await verifyOtp(getBrowserSupabase(), step.phone, code);
      router.replace(next);
      router.refresh();
    });
  }

  /** LOCAL DEMO ONLY: one-tap sign-in with the demo code (scripts/demo). */
  function demoSignIn(demoPhone: string) {
    void run(async () => {
      const normalised = await sendOtp(getBrowserSupabase(), demoPhone);
      await verifyOtp(getBrowserSupabase(), normalised, "123456");
      router.replace(next);
      router.refresh();
    });
  }

  if (step.kind === "phone") {
    return (
      <div className="space-y-6">
      {process.env.NEXT_PUBLIC_DEMO_MODE === "1" && (
        <section aria-label="Demo accounts" className="rounded-2xl border border-accent/30 bg-accent/5 p-4">
          <p className="mb-1 font-semibold">Demo accounts</p>
          <p className="mb-3 text-sm text-muted">Local demo with fictional data. Tap a person to sign in (code 123456).</p>
          <ul className="grid gap-2">
            {DEMO_ACCOUNTS.filter((a) => a.audience === audience).map((a) => (
              <li key={a.phone}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => demoSignIn(a.phone)}
                  className="flex w-full items-center gap-3 rounded-xl bg-surface px-3 py-2 text-left shadow-sm ring-1 ring-line transition hover:ring-accent disabled:opacity-60"
                >
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white" style={{ background: a.color }}>
                    {a.name.split(" ").map((w) => w[0]).join("")}
                  </span>
                  <span>
                    <span className="block font-medium">{a.name}</span>
                    <span className="block text-xs text-muted">{a.role}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <form onSubmit={onSendCode} className="space-y-4" noValidate>
        <TextField
          id="phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={error?.fieldErrors?.phone?.[0]}
          required
        />
        {error && !error.fieldErrors && <Alert tone="error">{error.userMessage}</Alert>}
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? "Sending…" : "Send code"}
        </Button>
        <p className="text-xs text-muted">
          By continuing you agree to receive a one-time code by SMS. Standard SMS rates may apply.
        </p>
      </form>
      </div>
    );
  }

  return (
    <form onSubmit={onVerify} className="space-y-4" noValidate>
      <p className="text-sm">
        Code sent to <span className="font-semibold">{step.phone}</span>.{" "}
        <button type="button" className="underline" onClick={() => { setStep({ kind: "phone" }); setCode(""); setError(null); }}>
          Change number
        </button>
      </p>
      <TextField
        id="code"
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        error={error?.fieldErrors?.token?.[0]}
        required
      />
      {error && !error.fieldErrors && <Alert tone="error">{error.userMessage}</Alert>}
      <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
        {busy ? "Checking…" : "Verify and continue"}
      </Button>
    </form>
  );
}
