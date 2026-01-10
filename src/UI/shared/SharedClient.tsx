"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../engine/supabase/client";

type Partnership = { id: string; partner_id: string };
type Profile = { user_id: string; display_name: string | null; email: string | null };

export default function SharedClient() {
  const supabase = useMemo(() => createClient(), []);
  const [meId, setMeId] = useState<string | null>(null);

  const [linkRow, setLinkRow] = useState<Partnership | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("Loading…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setStatus("Loading…");
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) return setStatus(authErr.message);
      if (!auth?.user) return setStatus("Auth session missing! Please log in.");

      setMeId(auth.user.id);
      await loadPartner(auth.user.id);
      setStatus("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPartner(ownerId: string) {
    // V1 assumes 0 or 1 partner; take the first
    const { data: rows, error } = await supabase
      .from("partnerships")
      .select("id, partner_id")
      .eq("owner_id", ownerId)
      .limit(1);

    if (error) {
      setStatus(error.message);
      return;
    }

    const row = rows?.[0] as Partnership | undefined;
    setLinkRow(row ?? null);

    if (!row) {
      setPartner(null);
      return;
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .eq("user_id", row.partner_id)
      .maybeSingle();

    if (profErr) {
      setStatus(profErr.message);
      return;
    }

    setPartner((prof as Profile) ?? null);
  }

  async function linkByEmail() {
    if (!meId) return;
    const e = email.trim().toLowerCase();
    if (!e) return setStatus("Enter an email.");

    setBusy(true);
    setStatus("");

    // Find partner in profiles by email
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .eq("email", e)
      .maybeSingle();

    if (profErr) {
      setBusy(false);
      return setStatus(profErr.message);
    }
    if (!prof) {
      setBusy(false);
      return setStatus("No user found with that email. They must sign up first.");
    }
    if (prof.user_id === meId) {
      setBusy(false);
      return setStatus("You can’t link yourself.");
    }

    // Optional: if you want only 1 partner, unlink existing first
    if (linkRow) {
      await supabase.from("partnerships").delete().eq("id", linkRow.id);
    }

    const { error: insErr } = await supabase.from("partnerships").insert({
      owner_id: meId,
      partner_id: prof.user_id,
    });

    if (insErr) {
      setBusy(false);
      return setStatus(insErr.message);
    }

    setEmail("");
    await loadPartner(meId);
    setBusy(false);
    setStatus("Partner linked ✅ (this will persist across logins/devices).");
  }

  async function unlink() {
    if (!meId) return;
    if (!linkRow) return;

    setBusy(true);
    setStatus("");

    const { error } = await supabase.from("partnerships").delete().eq("id", linkRow.id);

    if (error) {
      setBusy(false);
      return setStatus(error.message);
    }

    setLinkRow(null);
    setPartner(null);
    setBusy(false);
    setStatus("Unlinked.");
  }

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Shared</h1>

      {status ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
          {status}
        </div>
      ) : null}

      <section style={{ marginTop: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 16 }}>
        <h2 style={{ marginTop: 0 }}>Partner Link</h2>

        {partner ? (
          <>
            <div>
              Linked to: <b>{partner.display_name ?? partner.email ?? partner.user_id}</b>
            </div>
            <button
              onClick={unlink}
              disabled={busy}
              style={{
                marginTop: 12,
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "var(--card)",
                color: "var(--text)",
                cursor: busy ? "not-allowed" : "pointer",
              }}
            >
              Unlink
            </button>
          </>
        ) : (
          <>
            <div style={{ opacity: 0.8, marginBottom: 10 }}>
              No partner linked yet. Enter an email to link.
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@email.com"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  minWidth: 280,
                  background: "var(--bg)",
                  color: "var(--text)",
                }}
              />
              <button
                onClick={linkByEmail}
                disabled={busy}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "var(--card)",
                  color: "var(--text)",
                  cursor: busy ? "not-allowed" : "pointer",
                }}
              >
                Link
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
