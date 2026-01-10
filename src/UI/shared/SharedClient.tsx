"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../engine/supabase/Client";

type Partnership = { partner_id: string };
type Profile = { user_id: string; display_name: string | null; email: string | null };

type Task = {
  id: string;
  user_id: string; // owner
  title: string;
  is_shared: boolean;
  archived: boolean;
  created_at: string;
};

export default function SharedClient() {
  const supabase = useMemo(() => createClient(), []);

  const [meId, setMeId] = useState<string | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);

  const linked = !!partner;

  useEffect(() => {
    (async () => {
      setStatus("Loading…");

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) return setStatus(authErr.message);
      if (!auth?.user) return setStatus("Please log in.");

      setMeId(auth.user.id);

      await loadPartner(auth.user.id);
      setStatus("");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!meId) return;
    if (!linked) return;

    (async () => {
      await loadSharedTasks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, linked]);

  async function loadPartner(ownerId: string) {
    const { data: links, error } = await supabase
      .from("partnerships")
      .select("partner_id")
      .eq("owner_id", ownerId)
      .limit(1);

    if (error) {
      setStatus(error.message);
      return;
    }

    const link = (links?.[0] as Partnership | undefined) ?? null;
    if (!link) {
      setPartner(null);
      return;
    }

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .eq("user_id", link.partner_id)
      .maybeSingle();

    if (profErr) {
      setStatus(profErr.message);
      return;
    }

    setPartner((prof as Profile) ?? null);
  }

  async function loadSharedTasks() {
    setStatus("");
    const { data, error } = await supabase
      .from("tasks")
      .select("id,user_id,title,is_shared,archived,created_at")
      .eq("is_shared", true)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) return setStatus(error.message);
    setTasks((data as Task[]) ?? []);
  }

  async function linkNow() {
    if (!meId) return;
    const e = email.trim().toLowerCase();
    if (!e) return setStatus("Enter an email.");

    setBusy(true);
    setStatus("");

    const { error } = await supabase.rpc("link_partner_by_email", {
      partner_email: e,
    });

    if (error) {
      setBusy(false);
      return setStatus(error.message);
    }

    setEmail("");
    await loadPartner(meId);
    setBusy(false);
    setStatus("Linked ✅");
  }

  async function unlinkNow() {
    if (!meId) return;

    setBusy(true);
    setStatus("");

    const { error } = await supabase.rpc("unlink_partner");
    if (error) {
      setBusy(false);
      return setStatus(error.message);
    }

    setPartner(null);
    setTasks([]);
    setBusy(false);
    setStatus("Unlinked.");
  }

  const myTasks = tasks.filter((t) => t.user_id === meId);
  const partnerTasks = tasks.filter((t) => t.user_id !== meId);

  return (
    <main style={{ padding: 16, maxWidth: 1000, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Shared</h1>

      {status ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
          {status}
        </div>
      ) : null}

      {/* NOT LINKED: show only the link UI */}
      {!linked ? (
        <section style={{ marginTop: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 16 }}>
          <h2 style={{ marginTop: 0 }}>Link a partner</h2>
          <div style={{ opacity: 0.8, marginBottom: 10 }}>
            Enter their email (they must already have an account).
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
              onClick={linkNow}
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
        </section>
      ) : (
        /* LINKED: hide link UI entirely, show shared layout + unlink */
        <>
          <section style={{ marginTop: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                Linked to{" "}
                <b>{partner?.display_name ?? partner?.email ?? partner?.user_id.slice(0, 8)}</b>
              </div>
              <button
                onClick={unlinkNow}
                disabled={busy}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.7 : 1,
                }}
              >
                Unlink
              </button>
            </div>
          </section>

          {/* “Tasks page layout” style: two columns, my + partner */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
            <TaskBox title="My Shared Tasks" tasks={myTasks} />
            <TaskBox title="Partner Shared Tasks" tasks={partnerTasks} />
          </div>
        </>
      )}
    </main>
  );
}

function TaskBox({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <section style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {tasks.length === 0 ? (
        <div style={{ opacity: 0.75 }}>None yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.map((t) => (
            <div key={t.id} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 14 }}>
              <div style={{ fontWeight: 800 }}>{t.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {new Date(t.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
