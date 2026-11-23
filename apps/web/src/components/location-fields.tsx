"use client";

import { useState } from "react";

/**
 * Optional precise location from the device's live GPS. The browser asks the
 * user's permission; nothing is sent until the form is saved. Coordinates are
 * used for distance matching only and are never shown to other users.
 */
export function LocationFields({
  latName,
  lngName,
  defaultLat,
  defaultLng,
  hint = "Optional. Stand at the site and tap the button. Used only to work out distances; other users never see it.",
  onChange,
}: {
  latName: string;
  lngName: string;
  defaultLat?: number | null;
  defaultLng?: number | null;
  hint?: string;
  onChange?: (hasLocation: boolean) => void;
}) {
  const [lat, setLat] = useState(defaultLat != null ? String(defaultLat) : "");
  const [lng, setLng] = useState(defaultLng != null ? String(defaultLng) : "");
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  function locate() {
    if (!("geolocation" in navigator)) {
      setStatus({ tone: "error", text: "This browser cannot share location. You can choose the district instead." });
      return;
    }
    setBusy(true);
    setStatus({ tone: "info", text: "Finding your live location… allow location access if the browser asks." });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setAccuracy(Math.round(pos.coords.accuracy));
        setStatus({ tone: "info", text: "Live location added. Save to keep it." });
        onChange?.(true);
      },
      (err) => {
        setBusy(false);
        setStatus({
          tone: "error",
          text:
            err.code === err.PERMISSION_DENIED
              ? "Location access is blocked. Allow location for this site in your browser settings (the lock icon next to the address), then try again."
              : err.code === err.TIMEOUT
                ? "Could not get a location in time. Move near a window or outdoors and try again."
                : "Could not get your location. Try again, or choose the district instead.",
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function clear() {
    setLat("");
    setLng("");
    setAccuracy(null);
    setStatus({ tone: "info", text: "Location removed. Save to apply." });
    onChange?.(false);
  }

  return (
    <div className="space-y-2 text-sm">
      <input type="hidden" name={latName} value={lat} />
      <input type="hidden" name={lngName} value={lng} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={locate}
          disabled={busy}
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-soft px-4 font-semibold text-accent transition hover:brightness-95 active:scale-[0.98] disabled:opacity-60"
        >
          <PinIcon />
          {busy ? "Locating…" : lat ? "Update live location" : "Use my live location"}
        </button>
        {lat && (
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-full bg-green-soft px-3 py-1.5 text-success">
            <span className="font-semibold">Location set</span>
            {accuracy !== null && <span>within about {accuracy < 1000 ? `${accuracy} m` : `${(accuracy / 1000).toFixed(1)} km`}</span>}
            <a className="underline" href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noopener noreferrer">
              Check on map
            </a>
            <button type="button" className="underline" onClick={clear}>Remove</button>
          </span>
        )}
      </div>
      {accuracy !== null && accuracy > 500 && (
        <p className="text-warning">This location is approximate. For a better fix, turn on GPS / precise location and try again at the site.</p>
      )}
      {status && <p role="status" className={status.tone === "error" ? "text-danger" : "text-muted"}>{status.text}</p>}
      {hint && <p className="text-muted">{hint}</p>}
    </div>
  );
}

function PinIcon() {
  return (
    <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2a7 7 0 0 0-7 7c0 5.25 7 13 7 13s7-7.75 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5Z" />
    </svg>
  );
}
