"use client";

import { useState } from "react";

/**
 * Optional precise location. The browser asks the user's permission; nothing is
 * sent until the form is saved. Coordinates are used for distance matching only
 * and are never shown to other users.
 */
export function LocationFields({
  latName,
  lngName,
  defaultLat,
  defaultLng,
}: {
  latName: string;
  lngName: string;
  defaultLat?: number | null;
  defaultLng?: number | null;
}) {
  const [lat, setLat] = useState(defaultLat != null ? String(defaultLat) : "");
  const [lng, setLng] = useState(defaultLng != null ? String(defaultLng) : "");
  const [status, setStatus] = useState<string | null>(null);

  function locate() {
    if (!("geolocation" in navigator)) {
      setStatus("Your browser cannot share location. You can leave this empty.");
      return;
    }
    setStatus("Finding your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setStatus("Location added. Save to keep it.");
      },
      () => setStatus("Location not shared. You can leave this empty."),
      { enableHighAccuracy: false, timeout: 10000 },
    );
  }

  return (
    <div className="space-y-1 text-sm">
      <input type="hidden" name={latName} value={lat} />
      <input type="hidden" name={lngName} value={lng} />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={locate} className="min-h-10 rounded-md border border-line bg-surface px-3 hover:bg-subtle">
          {lat ? "Update my location" : "Use my current location"}
        </button>
        {lat && (
          <>
            <span className="text-muted">
              {Number(lat).toFixed(3)}, {Number(lng).toFixed(3)}
            </span>
            <button type="button" className="underline" onClick={() => { setLat(""); setLng(""); setStatus("Location removed. Save to apply."); }}>
              Remove
            </button>
          </>
        )}
      </div>
      <p className="text-muted">Optional. Used only to work out distances; other users never see it.</p>
      {status && <p role="status">{status}</p>}
    </div>
  );
}
