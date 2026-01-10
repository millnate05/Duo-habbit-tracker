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
  type: "habit" | "single";
  freq_times: number | null;
  freq_per: "day" | "week" | "month" | "year" | null;
  scheduled_days: number[] | null;
  weekly_skips_allowed: number;
  is_shared: boolean;
  archived: boolean;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null;
  punishment: string | null;
  reward: string | null;
};

type AssignChoice = "me" | "partner" | "both";

export default function SharedClient() {
  const supabase = useMemo(() => createClient(), []);

  const [meId, setMeId] = useState<string | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);

  // create task form
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<"habit" | "single">("habit");
  const [freqTimes, setFreqTimes] = useState<string>(""); // store as string, convert to number
  const [freqPer, setFreqPer] = useState<Task["freq_per"]>("day");
  const [weeklySkipsAllowed, setWeeklySkipsAllowed] = useState<string>("0");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null); // null = every day
  const [assignTo, setAssignTo] = useState<AssignChoice>("me");
  const [punishment, setPunishment] = useState("");
  const [reward, setReward] = useState("");

  const linked = !!partner;

  // Boot: load user + partner link
  useEffect(() => {
    let alive = true;

    (async () => {
      setStatus("Loading…");

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (authErr) return setStatus(authErr.message);

      const user = auth?.user;
      if (!user) return setStatus("Please log in.");

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

    // robust: find partnership row where I'm either owner or partner
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

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id,user_id,title,type,freq_times,freq_per,scheduled_days,weekly_skips_allowed,is_shared,archived,created_at,created_by,assigned_to,punishment,reward"
      )
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
      return setStatus(error.message);
    }

    setPartner(null);
    setTasks([]);
    setBusy(false);
    setStatus("Unlinked.");
  }

  function toggleDay(d: number) {
    // null = every day -> start from empty selection
    const cur = scheduledDays ?? [];
    const has = cur.includes(d);
    const next = has ? cur.filter((x) => x !== d) : [...cur, d].sort((a, b) => a - b);
    setScheduledDays(next.length === 0 ? null : next);
  }

  async function createSharedTask() {
    if (!meId || !partner) return;
    const trimmed = title.trim();
    if (!trimmed) return setStatus("Give the task a title.");

    setBusy(true);
    setStatus("");

    const ft =
      freqTimes.trim() === "" ? null : Math.max(1, Number.parseInt(freqTimes.trim(), 10));
    const fp = ft ? freqPer : null;
    const wsa = Math.max(0, Number.parseInt(weeklySkipsAllowed.trim() || "0", 10));

    // helper to build one task row
    const buildRow = (ownerId: string, assigneeId: string) => ({
      user_id: ownerId,
      title: trimmed,
      type: taskType,
      freq_times: ft,
      freq_per: fp,
      scheduled_days: scheduledDays, // null = every day
      weekly_skips_allowed: wsa,
      is_shared: true,
      archived: false,
      created_by: meId,
      assigned_to: assigneeId,
      punishment: punishment.trim() ? punishment.trim() : null,
      reward: reward.trim() ? reward.trim() : null,
    });

    // IMPORTANT:
    // - "Assign to Me": create task owned by me
    // - "Assign to Partner": create task owned by partner
    // - "Both": create two tasks (one owned by each)
    const rows =
      assignTo === "me"
        ? [buildRow(meId, meId)]
        : assignTo === "partner"
        ? [buildRow(partner.user_id, partner.user_id)]
        : [buildRow(meId, meId), buildRow(partner.user_id, partner.user_id)];

    const { error } = await supabase.from("tasks").insert(rows);

    if (error) {
      setBusy(false);
      return setStatus(error.message);
    }

    // reset form
    setTitle("");
    setFreqTimes("");
    setFreqPer("day");
    setWeeklySkipsAllowed("0");
    setScheduledDays(null);
    setAssignTo("me");
    setPunishment("");
    setReward("");

    await loadSharedTasks();
    setBusy(false);
    setStatus("Task created ✅");
  }

  const myTasks = tasks.filter((t) => t.user_id === meId);
  const partnerTasks = tasks.filter((t) => t.user_id !== meId);

  const partnerLabel =
    partner?.display_name ?? partner?.email ?? (partner ? partner.user_id.slice(0, 8) : "");

  return (
    <main style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Shared</h1>

      {status ? (
        <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
          {status}
        </div>
      ) : null}

      {!linked ? (
        // NOT LINKED: show link UI
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
              style={inputStyle(280)}
            />
            <button onClick={linkNow} disabled={busy} style={btnStyle(busy, true)}>
              Link
            </button>
          </div>
        </section>
      ) : (
        <>
          {/* linked header */}
          <section style={{ marginTop: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                Linked to <b>{partnerLabel}</b>
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={loadSharedTasks} disabled={busy} style={btnStyle(busy, false)}>
                  Refresh
                </button>
                <button onClick={unlinkNow} disabled={busy} style={btnStyle(busy, false)}>
                  Unlink
                </button>
              </div>
            </div>
          </section>

          {/* create task */}
          <section style={{ marginTop: 16, padding: 16, border: "1px solid var(--border)", borderRadius: 16 }}>
            <h2 style={{ marginTop: 0 }}>Create Shared Task</h2>

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 12 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={labelStyle()}>Title</label>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Gym session" style={inputStyle()} />

                <label style={labelStyle()}>Type</label>
                <select value={taskType} onChange={(e) => setTaskType(e.target.value as any)} style={inputStyle()}>
                  <option value="habit">Habit</option>
                  <option value="single">Single</option>
                </select>

                <label style={labelStyle()}>Assign to</label>
                <select value={assignTo} onChange={(e) => setAssignTo(e.target.value as AssignChoice)} style={inputStyle()}>
                  <option value="me">Me</option>
                  <option value="partner">Partner</option>
                  <option value="both">Both</option>
                </select>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={labelStyle()}>Frequency times (optional)</label>
                    <input
                      value={freqTimes}
                      onChange={(e) => setFreqTimes(e.target.value)}
                      placeholder="e.g., 3"
                      style={inputStyle()}
                      inputMode="numeric"
                    />
                  </div>
                  <div>
                    <label style={labelStyle()}>Per</label>
                    <select
                      value={freqPer ?? "day"}
                      onChange={(e) => setFreqPer(e.target.value as any)}
                      style={inputStyle()}
                      disabled={freqTimes.trim() === ""}
                    >
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                  </div>
                </div>

                <label style={labelStyle()}>Weekly skips allowed</label>
                <input
                  value={weeklySkipsAllowed}
                  onChange={(e) => setWeeklySkipsAllowed(e.target.value)}
                  placeholder="0"
                  style={inputStyle()}
                  inputMode="numeric"
                />

                <label style={labelStyle()}>Scheduled days (optional)</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((name, idx) => {
                    const active = (scheduledDays ?? []).includes(idx);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleDay(idx)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          background: active ? "rgba(255,255,255,0.08)" : "transparent",
                          color: "var(--text)",
                          cursor: "pointer",
                          fontWeight: 800,
                          opacity: 0.95,
                        }}
                      >
                        {name}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setScheduledDays(null)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text)",
                      cursor: "pointer",
                      opacity: 0.8,
                      fontWeight: 800,
                    }}
                    title="Clear schedule (every day)"
                  >
                    Clear
                  </button>
                </div>

                <button onClick={createSharedTask} disabled={busy} style={btnStyle(busy, true)}>
                  Create task
                </button>
              </div>

              {/* punishment & reward */}
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <label style={labelStyle()}>Punishment (optional)</label>
                <textarea
                  value={punishment}
                  onChange={(e) => setPunishment(e.target.value)}
                  placeholder="e.g., $10 to the other person / no dessert tonight"
                  style={textareaStyle()}
                  rows={5}
                />

                <label style={labelStyle()}>Reward (optional)</label>
                <textarea
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  placeholder="e.g., movie night / pick dinner"
                  style={textareaStyle()}
                  rows={5}
                />

                <div style={{ opacity: 0.7, fontSize: 13 }}>
                  For “Both”, the app creates one task under each account so each person owns their copy.
                </div>
              </div>
            </div>
          </section>

          {/* tasks */}
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
              <div style={{ fontWeight: 900 }}>{t.title}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                {t.type.toUpperCase()}
                {t.freq_times ? ` • ${t.freq_times}/${t.freq_per}` : ""} •{" "}
                {new Date(t.created_at).toLocaleString()}
              </div>

              {(t.punishment || t.reward) ? (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                  {t.punishment ? (
                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                      <b>Punishment:</b> {t.punishment}
                    </div>
                  ) : null}
                  {t.reward ? (
                    <div style={{ fontSize: 13, opacity: 0.9 }}>
                      <b>Reward:</b> {t.reward}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
                Assigned: <b>{t.assigned_to ? t.assigned_to.slice(0, 8) : "—"}</b> • Created:{" "}
                <b>{t.created_by ? t.created_by.slice(0, 8) : "—"}</b>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function labelStyle(): React.CSSProperties {
  return { fontSize: 13, fontWeight: 900, opacity: 0.9 };
}

function inputStyle(minWidth?: number): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    outline: "none",
    minWidth: minWidth ?? undefined,
  };
}

function textareaStyle(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    outline: "none",
    resize: "vertical",
  };
}

function btnStyle(disabled: boolean, primary: boolean): React.CSSProperties {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    border: primary ? "1px solid var(--border)" : "1px solid var(--border)",
    background: primary ? "var(--card)" : "transparent",
    color: "var(--text)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
    fontWeight: 900,
  };
}
