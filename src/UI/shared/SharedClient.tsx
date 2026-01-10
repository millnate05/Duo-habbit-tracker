"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "../../engine/supabase/Client";

type Profile = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

type PartnershipRow = {
  owner_id: string;
  partner_id: string;
};

type Task = {
  id: string;
  user_id: string; // owner of the task
  title: string;
  is_shared: boolean;
  archived: boolean;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null;
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

  // Boot: load user + partner link
  useEffect(() => {
    let alive = true;

    (async () => {
      setStatus("Loading…");

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (authErr) {
        setStatus(authErr.message);
        return;
      }

      const user = auth?.user;
      if (!user) {
        setStatus("Please log in.");
        return;
      }

      setMeId(user.id);
      await loadPartner(user.id);

      setStatus("");
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When linked, load tasks
  useEffect(() => {
    if (!meId) return;
    if (!linked) return;

    (async () => {
      await loadSharedTasks();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, linked]);

  async function loadPartner(me: string) {
    setStatus("");

    // Robust: find any partnership row where I'm either the owner OR the partner
    const { data: links, error } = await supabase
      .from("partnerships")
      .select("owner_id, partner_id")
      .or(`owner_id.eq.${me},partner_id.eq.${me}`)
      .limit(1);

    if (error) {
      setStatus(error.message);
      setPartner(null);
      return;
    }

    const link = (links?.[0] as PartnershipRow | undefined) ?? null;
    if (!link) {
      setPartner(null);
      return;
    }

    const otherId = link.owner_id === me ? link.partner_id : link.owner_id;

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .eq("user_id", otherId)
      .maybeSingle();

    if (profErr) {
      setStatus(profErr.message);
      setPartner(null);
      return;
    }

    setPartner((prof as Profile) ?? null);
  }

  async function loadSharedTasks() {
    setStatus("");

    // RLS should automatically give:
    // - my own tasks (any)
    // - partner's tasks ONLY if they are shared and we’re linked
    const { data, error } = await supabase
      .from("tasks")
      .select("id,user_id,title,is_shared,archived,created_at,created_by,assigned_to")
      .eq("is_shared", true)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      setStatus(error.message);
      return;
    }

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
      setStatus(error.message);
      return;
    }

    setEmail("");
    await loadPartner(meId);
    await loadSharedTasks();

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
      setStatus(error.message);
      return;
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
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border്er: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          {status}
        </div>
      ) : null}

      {!linked ? (
        // NOT LINKED: show link UI
        <section
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid var(--border)",
            borderRadius: 16,
          }}
        >
          <h2 style={{ marginTop: 0 }}>Link a partner</h2>
          <div style={{ opacity: 0.8, marginBottom: 10 }}>
            Enter their email (they must already have an account).
          </div>

          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
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
                outline: "none",
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
                opacity: busy ? 0.7 : 1,
              }}
            >
              Link
            </button>
          </div>
        </section>
      ) : (
        // LINKED: show partner + unlink + tasks layout
        <>
          <section
            style={{
              marginTop: 16,
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: 16,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                Linked to{" "}
                <b>
                  {partner?.display_name ??
                    partner?.email ??
                    partner?.user_id.slice(0, 8)}
                </b>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={loadSharedTasks}
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
                  Refresh
                </button>

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
            </div>
          </section>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 16,
              marginTop: 16,
            }}
          >
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
    <section
      style={{
        padding: 16,
        border: "1px solid var(--border)",
        borderRadius: 16,
      }}
    >
      <h3 style={{ marginTop: 0 }}>{title}</h3>

      {tasks.length === 0 ? (
        <div style={{ opacity: 0.75 }}>None yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.map((t) => (
            <div
              key={t.id}
              style={{
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontWeight: 800 }}>{t.title}</div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                {new Date(t.created_at).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                Assigned to:{" "}
                <b>{t.assigned_to ? t.assigned_to.slice(0, 8) : "—"}</b> · Created
                by: <b>{t.created_by ? t.created_by.slice(0, 8) : "—"}</b>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
