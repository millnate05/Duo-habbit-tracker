"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../engine/supabase/Client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<string>("Checking reset link…");

  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");

  useEffect(() => {
    (async () => {
      setStatus("Checking reset link…");

      // Some Supabase setups use `code` in query. Others include tokens in the URL hash.
      // This makes it robust:
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(
          window.location.href
        );
        if (error) {
          setStatus(error.message);
          setReady(false);
          return;
        }
      }

      // Now we should have a session if the link is valid
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setStatus(error.message);
        setReady(false);
        return;
      }

      if (!data.session) {
        setStatus("This reset link is invalid or expired. Please request a new one.");
        setReady(false);
        return;
      }

      setStatus("");
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updatePassword() {
    setStatus("");

    if (!pw1 || !pw2) return setStatus("Enter your new password twice.");
    if (pw1 !== pw2) return setStatus("Passwords do not match.");
    if (pw1.length < 8) return setStatus("Password must be at least 8 characters.");

    const { error } = await supabase.auth.updateUser({ password: pw1 });
    if (error) return setStatus(error.message);

    setStatus("Password updated ✅ Redirecting…");
    setTimeout(() => router.push("/"), 800);
  }

  return (
    <main style={{ padding: 16, maxWidth: 520, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Choose a new password</h1>

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

      {ready ? (
        <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
          <input
            type="password"
            value={pw1}
            onChange={(e) => setPw1(e.target.value)}
            placeholder="New password"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />

          <input
            type="password"
            value={pw2}
            onChange={(e) => setPw2(e.target.value)}
            placeholder="Confirm new password"
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
            }}
          />

          <button
            onClick={updatePassword}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--card)",
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            Update password
          </button>
        </div>
      ) : null}
    </main>
  );
}
