"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { sendOtp, verifyOtp } from "@itm/api";
import { reportError, toAppError, type AppError } from "@itm/core";
import { getBrowserSupabase } from "./browser";
import { Alert, Button, TextField } from "@itm/ui";

type Step = { kind: "phone" } | { kind: "code"; phone: string };

export function SignInForm({ next }: { next: string }) {
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

  if (step.kind === "phone") {
    return (
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
