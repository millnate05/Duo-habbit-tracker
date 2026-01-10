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
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loggedIn = useMemo(() => !!userId, [userId]);

  // Load current session + listen for auth changes
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

  async function handleAuth() {
    setStatus(null);
    setBusy(true);
    try {
      if (!email.trim() || !password) {
        setStatus("Enter an email and password.");
        return;
      }

      if (mode === "signup") {
        // ✅ include emailRedirectTo so confirmation links return to your site
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/profile`,
          },
        });
        if (error) throw error;

        // If email confirmations are enabled, user may need to verify email
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

                <button
                  onClick={handleAuth}
                  disabled={busy}
                  style={primaryBtnStyle(busy)}
                  type="button"
                >
                  {mode === "signup" ? "Create account" : "Log in"}
                </button>

                {/* Forgot password link (login mode only) */}
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

                <div style={{ fontWeight: 900 }}>Display name</div>
                <input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="(optional)"
                  style={inputStyle()}
                />

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    onClick={saveDisplayName}
                    disabled={busy}
                    style={primaryBtnStyle(busy)}
                    type="button"
                  >
                    Save
                  </button>

                  <button
                    onClick={handleLogout}
                    disabled={busy}
                    style={secondaryBtnStyle(busy)}
                    type="button"
                  >
                    Log out
                  </button>
                </div>
              </div>

              <div style={{ opacity: 0.7, marginTop: 10, fontSize: 13 }}>
                Next: we’ll move tasks + proof photos into Supabase so they follow your account
                across devices.
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
