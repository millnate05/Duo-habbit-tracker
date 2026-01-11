"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { theme } from "@/UI/theme";

type Mode = "login" | "signup";

export default function ProfilePage() {
  const [mode, setMode] = useState<Mode>("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [partnerLabel, setPartnerLabel] = useState<string | null>(null);

  // Push toggle state (this device)
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loggedIn = useMemo(() => !!userId, [userId]);

  // ---------- Push helpers ----------
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

  async function getSubscription() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function syncPushEnabledFromBrowser() {
    const ok =
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window;

    setPushSupported(ok);
    if (!ok) {
      setPushEnabled(false);
      return;
    }

    try {
      await registerSW();
      const sub = await getSubscription();
      setPushEnabled(!!sub);
    } catch {
      setPushEnabled(false);
    }
  }

  async function togglePush(next: boolean) {
    setPushMsg(null);

    if (!loggedIn) {
      setPushMsg("Log in first to enable push notifications.");
      return;
    }

    if (!pushSupported) {
      setPushMsg("Push notifications aren't supported on this device/browser.");
      return;
    }

    setBusy(true);
    try {
      if (next) {
        const ok = await registerSW();
        if (!ok) throw new Error("Service workers not supported.");

        const perm = await Notification.requestPermission();
        if (perm !== "granted") throw new Error("Notifications permission not granted.");

        const reg = await navigator.serviceWorker.ready;

        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY env var.");

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
          throw new Error(j.error || "Failed to save push subscription.");
        }

        setPushEnabled(true);
        setPushMsg("Push notifications enabled on this device.");
      } else {
        const existing = await getSubscription();
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
            throw new Error(j.error || "Failed to remove push subscription.");
          }
        }

        setPushEnabled(false);
        setPushMsg("Push notifications disabled on this device.");
      }
    } catch (e: any) {
      setPushMsg(e?.message ?? "Something went wrong enabling push notifications.");
      // Re-sync from browser so UI matches reality
      await syncPushEnabledFromBrowser();
    } finally {
      setBusy(false);
    }
  }

  // ---------- Auth/session ----------
  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;
      if (error) setStatus(error.message);

      const user = data.session?.user ?? null;
      setUserId(user?.id ?? null);
      setSessionEmail(user?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setUserId(user?.id ?? null);
      setSessionEmail(user?.email ?? null);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Push support/subscription state (runs once, and again when login state changes)
  useEffect(() => {
    syncPushEnabledFromBrowser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn]);

  // Ensure profile row exists once logged in
  useEffect(() => {
    if (!userId) return;

    (async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        console.error(error);
        setStatus(error.message);
        return;
      }

      // If no row, create one
      if (!data) {
        const { error: insErr } = await supabase.from("profiles").insert({
          user_id: userId,
          display_name: "",
        });

        if (insErr) {
          console.error(insErr);
          setStatus(insErr.message);
          return;
        }

        setDisplayName("");
        setStatus(null);
        return;
      }

      setDisplayName(data.display_name ?? "");
      setStatus(null);
    })();
  }, [userId]);

  // Load partner label when logged in (v1: 0 or 1 partner)
  useEffect(() => {
    if (!userId) {
      setPartnerLabel(null);
      return;
    }

    (async () => {
      const { data: links, error: linkErr } = await supabase
        .from("partnerships")
        .select("partner_id")
        .eq("owner_id", userId)
        .limit(1);

      if (linkErr) {
        console.error(linkErr);
        setStatus(linkErr.message);
        return;
      }

      const partnerId = (links?.[0] as any)?.partner_id as string | undefined;
      if (!partnerId) {
        setPartnerLabel(null);
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("display_name,email")
        .eq("user_id", partnerId)
        .maybeSingle();

      if (profErr) {
        console.error(profErr);
        setStatus(profErr.message);
        return;
      }

      setPartnerLabel(prof?.display_name ?? prof?.email ?? partnerId.slice(0, 8));
    })();
  }, [userId]);

  async function handleAuth() {
    setStatus(null);
    setBusy(true);
    try {
      if (!email.trim() || !password) {
        setStatus("Enter an email and password.");
        return;
      }

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/profile`,
          },
        });
        if (error) throw error;

        if (!data.session) {
          setStatus("Account created. Check your email to confirm, then log in.");
        } else {
          setStatus("Signed up and logged in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;

        setStatus("Logged in.");
      }

      setPassword("");
    } catch (e: any) {
      setStatus(e?.message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function handleLogout() {
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      setEmail("");
      setPassword("");
      setDisplayName("");
      setPartnerLabel(null);

      setPushEnabled(false);
      setPushMsg(null);

      setStatus("Logged out.");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to log out.");
    } finally {
      setBusy(false);
    }
  }

  async function saveDisplayName() {
    if (!userId) return;
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: displayName })
        .eq("user_id", userId);

      if (error) throw error;
      setStatus("Saved.");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function unlinkPartner() {
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase.rpc("unlink_partner");
      if (error) throw error;

      setPartnerLabel(null);
      setStatus("Unlinked partner.");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to unlink.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 720,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Profile</h1>
          <p style={{ margin: "6px 0 0 0", opacity: 0.8 }}>
            Log in to sync tasks, completions, and photo proof per user.
          </p>
        </div>

        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
          }}
        >
          {!loggedIn ? (
            <>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  overflow: "hidden",
                  width: "fit-content",
                  marginBottom: 12,
                }}
              >
                <ModeBtn
                  active={mode === "login"}
                  label="Login"
                  onClick={() => setMode("login")}
                />
                <ModeBtn
                  active={mode === "signup"}
                  label="Sign up"
                  onClick={() => setMode("signup")}
                />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  autoComplete="email"
                  style={inputStyle()}
                />

                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  style={inputStyle()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAuth();
                  }}
                />

                <button onClick={handleAuth} disabled={busy} style={primaryBtnStyle(busy)} type="button">
                  {mode === "signup" ? "Create account" : "Log in"}
                </button>

                {mode === "login" ? (
                  <div style={{ marginTop: 2 }}>
                    <Link href="/forgot-password" style={linkStyle()}>
                      Forgot password?
                    </Link>
                  </div>
                ) : null}
              </div>

              <div style={{ opacity: 0.7, marginTop: 10, fontSize: 13 }}>
                Supabase will remember your login automatically on this device.
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ opacity: 0.85 }}>
                  Logged in as <b>{sessionEmail}</b>
                </div>
                <div style={{ opacity: 0.7, fontSize: 13 }}>User ID: {userId}</div>

                <div style={{ height: 6 }} />

                <div style={{ fontWeight: 900 }}>Push notifications (this device)</div>
                {pushSupported ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      border: "1px solid var(--border)",
                      borderRadius: 12,
                      padding: 12,
                      background: "rgba(255,255,255,0.01)",
                    }}
                  >
                    <div style={{ opacity: 0.85, maxWidth: 480 }}>
                      {pushEnabled ? (
                        <>Enabled. You can turn this off anytime.</>
                      ) : (
                        <>
                          Off. Turn on to enable push notifications on this device. On iPhone, install the app to
                          Home Screen first.
                        </>
                      )}
                      {pushMsg ? (
                        <div style={{ marginTop: 6, fontSize: 13, opacity: 0.9 }}>{pushMsg}</div>
                      ) : null}
                    </div>

                    <label style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                      <input
                        type="checkbox"
                        checked={pushEnabled}
                        disabled={busy}
                        onChange={(e) => togglePush(e.target.checked)}
                      />
                      <span style={{ fontWeight: 900 }}>{pushEnabled ? "On" : "Off"}</span>
                    </label>
                  </div>
                ) : (
                  <div style={{ opacity: 0.7, fontSize: 13 }}>
                    Push isn’t supported on this device/browser. On iPhone, install the app to Home Screen first.
                  </div>
                )}

                <div style={{ height: 6 }} />

                <div style={{ fontWeight: 900 }}>Partner</div>
                {partnerLabel ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ opacity: 0.85 }}>
                      Linked to <b>{partnerLabel}</b>
                    </div>
                    <button onClick={unlinkPartner} disabled={busy} style={secondaryBtnStyle(busy)} type="button">
                      Unlink
                    </button>
                  </div>
                ) : (
                  <div style={{ opacity: 0.7, fontSize: 13 }}>
                    No partner linked. Go to <b>Shared</b> to link by email.
                  </div>
                )}

                <div style={{ height: 6 }} />

                <div style={{ fontWeight: 900 }}>Display name</div>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="(optional)"
                  style={inputStyle()}
                />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button onClick={saveDisplayName} disabled={busy} style={primaryBtnStyle(busy)} type="button">
                    Save
                  </button>

                  <button onClick={handleLogout} disabled={busy} style={secondaryBtnStyle(busy)} type="button">
                    Log out
                  </button>
                </div>
              </div>

              <div style={{ opacity: 0.7, marginTop: 10, fontSize: 13 }}>
                Next: shared tasks + proof will appear in the Shared tab once you’re linked.
              </div>
            </>
          )}
        </section>

        {status ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 12,
              background: "rgba(255,255,255,0.02)",
              opacity: 0.95,
            }}
          >
            {status}
          </div>
        ) : null}
      </div>
    </main>
  );
}

function ModeBtn({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "10px 12px",
        border: "none",
        cursor: "pointer",
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        color: "var(--text)",
        fontWeight: 900,
      }}
    >
      {label}
    </button>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    padding: "12px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    outline: "none",
  };
}

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "12px 14px",
    borderRadius: 12,
    border: `1px solid ${theme.accent.primary}`,
    background: "transparent",
    color: "var(--text)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function secondaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}

function linkStyle(): React.CSSProperties {
  return {
    display: "inline-block",
    fontSize: 13,
    fontWeight: 800,
    opacity: 0.85,
    textDecoration: "underline",
    color: "var(--text)",
  };
}
