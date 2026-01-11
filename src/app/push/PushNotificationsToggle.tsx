"use client";

import { useEffect, useMemo, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registerSW() {
  if (!("serviceWorker" in navigator)) return false;
  await navigator.serviceWorker.register("/sw.js");
  return true;
}

async function getSub() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export default function PushNotificationsToggle() {
  const supported = useMemo(() => {
    return (
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window
    );
  }, []);

  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supported) return;
    (async () => {
      await registerSW();
      const sub = await getSub();
      setEnabled(!!sub);
    })();
  }, [supported]);

  async function setToggle(next: boolean) {
    setMsg(null);
    setBusy(true);

    try {
      if (next) {
        const ok = await registerSW();
        if (!ok) throw new Error("Service workers not supported.");

        const perm = await Notification.requestPermission();
        if (perm !== "granted") throw new Error("Notifications permission not granted.");

        const reg = await navigator.serviceWorker.ready;

        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY");

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });

        const json = sub.toJSON();

        const res = await fetch("/api/push/subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "upsert",
            endpoint: json.endpoint,
            keys: json.keys,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            locale: navigator.language,
          }),
        });

        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j.error || "Failed to save subscription.");
        }

        setEnabled(true);
      } else {
        const existing = await getSub();
        const json = existing?.toJSON();

        if (existing) await existing.unsubscribe();

        if (json?.endpoint) {
          const res = await fetch("/api/push/subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete", endpoint: json.endpoint }),
          });

          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            throw new Error(j.error || "Failed to remove subscription.");
          }
        }

        setEnabled(false);
      }
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong.");
      setEnabled(!next);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) {
    return (
      <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
        <div style={{ fontWeight: 700 }}>Push Notifications</div>
        <div style={{ opacity: 0.8, marginTop: 6 }}>
          Not supported on this device/browser. On iPhone, install the app to Home Screen first.
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
        <div>
          <div style={{ fontWeight: 700 }}>Push Notifications</div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>
            Turn on to enable notifications on this device.
          </div>
        </div>

        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => setToggle(e.target.checked)}
          />
          <span>{enabled ? "On" : "Off"}</span>
        </label>
      </div>

      {msg ? <div style={{ marginTop: 10, color: "var(--danger)" }}>{msg}</div> : null}
    </div>
  );
}
