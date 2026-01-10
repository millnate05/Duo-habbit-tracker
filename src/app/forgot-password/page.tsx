"use client";

import { useMemo, useState } from "react";
import { createClient } from "../../engine/supabase/Client";

export default function ForgotPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("");

  async function sendReset() {
    setStatus("");
    const e = email.trim().toLowerCase();
    if (!e) return setStatus("Enter your email.");

    const redirectTo =
      typeof window !== "undefined"
        ? `${window.location.origin}/reset-password`
        : undefined;

    const { error } = await supabase.auth.resetPasswordForEmail(e, {
      redirectTo,
    });

    if (error) return setStatus(error.message);

    setStatus(
      "If an account exists for that email, a password reset link has been sent."
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Reset Password</h1>
      <p style={{ opacity: 0.85 }}>
        Enter your email and we’ll send you a reset link.
      </p>

      {status ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          {status}
        </div>
      ) : null}

      <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--text)",
          }}
        />

        <button
          onClick={sendReset}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            background: "var(--card)",
            color: "var(--text)",
            cursor: "pointer",
          }}
        >
          Send reset email
        </button>
      </div>
    </main>
  );
}
