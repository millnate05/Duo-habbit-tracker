"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { theme } from "@/UI/theme";

type TaskType = "habit" | "single";
type FrequencyUnit = "day" | "week" | "month" | "year";

type TaskRow = {
  id: string;
  user_id: string;
  title: string;
  type: TaskType;
  freq_times: number | null;
  freq_per: FrequencyUnit | null;
  archived: boolean;
  created_at: string;

  scheduled_days: number[] | null; // 0=Sun..6=Sat, null => every day
  weekly_skips_allowed: number; // default 0
};

const DOW = [
  { n: 0, label: "Sun" },
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
];

function fmtScheduledDays(days: number[] | null) {
  if (!days || days.length === 0) return "Every day";
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((d) => DOW.find((x) => x.n === d)?.label ?? "?").join(", ");
}

function sanitizeTimes(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(999, Math.floor(n)));
}

function sanitizeSkips(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(7, Math.floor(n)));
}

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);

  // Create form
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [freqTimes, setFreqTimes] = useState(1);
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null); // null => every day
  const [weeklySkipsAllowed, setWeeklySkipsAllowed] = useState(0);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);

  // Auth session
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) setStatus(error.message);

      const u = data.session?.user ?? null;
      setUserId(u?.id ?? null);
      setSessionEmail(u?.email ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user ?? null;
      setUserId(u?.id ?? null);
      setSessionEmail(u?.email ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function loadTasks(uid: string) {
    setLoading(true);
    setStatus(null);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setStatus(error.message);
      setTasks([]);
      setLoading(false);
      return;
    }

    setTasks((data ?? []) as TaskRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    loadTasks(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((t) => t.archived), [tasks]);

  function toggleDay(
    day: number,
    current: number[] | null,
    setFn: (v: number[] | null) => void
  ) {
    // If null (every day), start from full week selected
    const base = current ?? [0, 1, 2, 3, 4, 5, 6];
    const set = new Set(base);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    const next = Array.from(set).sort((a, b) => a - b);
    // If all 7 selected, store null to mean "every day"
    if (next.length === 7) setFn(null);
    else setFn(next);
  }

  async function createTask() {
    if (!userId) return;
    const t = title.trim();
    if (!t) {
      setStatus("Task title is required.");
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      // ✅ RLS-required fields included (fix)
      const base = {
        user_id: userId,
        created_by: userId,
        assigned_to: userId,
        is_shared: false,
        title: t,
        type,
        archived: false,
        scheduled_days: scheduledDays,
        weekly_skips_allowed: weeklySkipsAllowed,
        freq_times: null as number | null,
        freq_per: null as FrequencyUnit | null,
      };

      if (type === "habit") {
        base.freq_times = freqTimes;
        base.freq_per = freqPer;
      }

      const { data, error } = await supabase
        .from("tasks")
        .insert(base)
        .select("*")
        .single();

      if (error) throw error;

      setTasks((prev) => [data as TaskRow, ...prev]);
      setTitle("");
      setType("habit");
      setFreqTimes(1);
      setFreqPer("week");
      setScheduledDays(null);
      setWeeklySkipsAllowed(0);
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to create task.");
    } finally {
      setBusy(false);
    }
  }

  function openEdit(t: TaskRow) {
    setEditTask(t);
    setEditOpen(true);
    setStatus(null);
  }

  async function saveEdit(next: TaskRow) {
    if (!userId) return;

    const t = next.title.trim();
    if (!t) {
      setStatus("Title is required.");
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const { data, error } = await supabase
        .from("tasks")
        .update({
          title: t,
          type: next.type,
          freq_times: next.type === "habit" ? next.freq_times : null,
          freq_per: next.type === "habit" ? next.freq_per : null,
          scheduled_days: next.scheduled_days,
          weekly_skips_allowed: next.weekly_skips_allowed,
          archived: next.archived,
        })
        .eq("id", next.id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) throw error;

      const updated = data as TaskRow;
      setTasks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));

      setEditOpen(false);
      setEditTask(null);
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(t: TaskRow) {
    if (!userId) return;
    setBusy(true);
    setStatus(null);

    try {
      const { data, error } = await supabase
        .from("tasks")
        .update({ archived: !t.archived })
        .eq("id", t.id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) throw error;
      const updated = data as TaskRow;
      setTasks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to update task.");
    } finally {
      setBusy(false);
    }
  }

  if (!userId) {
    return (
      <main
        style={{
          minHeight: theme.layout.fullHeight,
          background: theme.page.background,
          color: theme.page.text,
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
          <p style={{ margin: "8px 0 0 0", opacity: 0.8 }}>
            Log in to manage tasks.
          </p>

          <div style={{ height: 14 }} />

          <Link
            href="/profile"
            style={{
              display: "inline-block",
              padding: "12px 14px",
              borderRadius: 12,
              border: `1px solid ${theme.accent.primary}`,
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 900,
            }}
          >
            Go to Profile (Log in)
          </Link>
        </div>
      </main>
    );
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
          maxWidth: 980,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Logged in as <b>{sessionEmail}</b>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              alignItems: "flex-start",
            }}
          >
            <Link
              href="/"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                color: "var(--text)",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              Home
            </Link>

            <Link
              href="/completed"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                color: "var(--text)",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              Completed
            </Link>
          </div>
        </div>

        {status ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 12,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            {status}
          </div>
        ) : null}

        {/* Create card */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900 }}>Create Task</div>
          <div style={{ height: 12 }} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 12 }}>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                outline: "none",
              }}
            />

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <label style={{ fontWeight: 900, opacity: 0.9 }}>Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as TaskType)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  outline: "none",
                }}
              >
                <option value="habit">Habit</option>
                <option value="single">Single</option>
              </select>

              {type === "habit" ? (
                <>
                  <label style={{ fontWeight: 900, opacity: 0.9 }}>
                    Frequency
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={freqTimes}
                    onChange={(e) => setFreqTimes(sanitizeTimes(e.target.value))}
                    style={{
                      width: 90,
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text)",
                      outline: "none",
                    }}
                  />
                  <span style={{ opacity: 0.85 }}>x per</span>
                  <select
                    value={freqPer}
                    onChange={(e) => setFreqPer(e.target.value as FrequencyUnit)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text)",
                      outline: "none",
                    }}
                  >
                    <option value="day">day</option>
                    <option value="week">week</option>
                    <option value="month">month</option>
                    <option value="year">year</option>
                  </select>
                </>
              ) : null}
            </div>

            {/* Scheduled days */}
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>
                Scheduled days
              </div>
              <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 10 }}>
                If you select all 7 days, it becomes <b>Every day</b>.
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DOW.map((d) => {
                  const selected = (scheduledDays ?? [
                    0, 1, 2, 3, 4, 5, 6,
                  ]).includes(d.n);
                  return (
                    <button
                      key={d.n}
                      type="button"
                      onClick={() => toggleDay(d.n, scheduledDays, setScheduledDays)}
                      disabled={busy}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 999,
                        border: `1px solid ${
                          selected ? theme.accent.primary : "var(--border)"
                        }`,
                        background: selected
                          ? "rgba(255,255,255,0.04)"
                          : "transparent",
                        color: "var(--text)",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 10, opacity: 0.85 }}>
                Selected: <b>{fmtScheduledDays(scheduledDays)}</b>
              </div>
            </div>

            {/* Weekly skips allowed */}
            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 900 }}>Weekly skips allowed</div>
              <input
                type="number"
                min={0}
                max={7}
                value={weeklySkipsAllowed}
                onChange={(e) =>
                  setWeeklySkipsAllowed(sanitizeSkips(e.target.value))
                }
                style={{
                  width: 90,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  outline: "none",
                }}
              />
              <div style={{ opacity: 0.8, fontSize: 13 }}>
                Example: a 5x/week task can allow 2 skips.
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={createTask}
                disabled={busy}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${theme.accent.primary}`,
                  background: "transparent",
                  color: "var(--text)",
                  fontWeight: 900,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Create
              </button>
            </div>
          </div>
        </section>

        {/* List */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900 }}>Active Tasks</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Total: <b>{activeTasks.length}</b>
          </div>
          <div style={{ height: 12 }} />

          {loading ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              Loading…
            </div>
          ) : activeTasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              No active tasks.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeTasks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 900 }}>{t.title}</div>
                    <div style={{ opacity: 0.85, marginTop: 6 }}>
                      {t.type === "habit" ? (
                        <>
                          Habit • <b>{t.freq_times ?? 1}x</b> per{" "}
                          <b>{t.freq_per ?? "week"}</b>
                        </>
                      ) : (
                        <>Single</>
                      )}
                      <span>
                        {" "}
                        • Days: <b>{fmtScheduledDays(t.scheduled_days)}</b>
                      </span>
                      <span>
                        {" "}
                        • Skips/wk: <b>{t.weekly_skips_allowed ?? 0}</b>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => openEdit(t)}
                      disabled={busy}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: `1px solid ${theme.accent.primary}`,
                        background: "transparent",
                        color: "var(--text)",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Edit
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleArchive(t)}
                      disabled={busy}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Archive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Archived */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900 }}>Archived</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Total: <b>{archivedTasks.length}</b>
          </div>
          <div style={{ height: 12 }} />

          {archivedTasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              No archived tasks.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {archivedTasks.map((t) => (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div style={{ minWidth: 240 }}>
                    <div style={{ fontWeight: 900 }}>{t.title}</div>
                    <div style={{ opacity: 0.85, marginTop: 6 }}>
                      {t.type === "habit" ? (
                        <>
                          Habit • <b>{t.freq_times ?? 1}x</b> per{" "}
                          <b>{t.freq_per ?? "week"}</b>
                        </>
                      ) : (
                        <>Single</>
                      )}
                      <span>
                        {" "}
                        • Days: <b>{fmtScheduledDays(t.scheduled_days)}</b>
                      </span>
                      <span>
                        {" "}
                        • Skips/wk: <b>{t.weekly_skips_allowed ?? 0}</b>
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleArchive(t)}
                    disabled={busy}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${theme.accent.primary}`,
                      background: "transparent",
                      color: "var(--text)",
                      fontWeight: 900,
                      cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    Unarchive
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Edit modal */}
        {editOpen && editTask && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.55)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
              zIndex: 999,
            }}
            onClick={() => {
              if (busy) return;
              setEditOpen(false);
              setEditTask(null);
            }}
          >
            <div
              style={{
                width: "min(780px, 100%)",
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
                padding: 16,
                textAlign: "left",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontWeight: 900, fontSize: 18 }}>Edit Task</div>

              <div style={{ height: 12 }} />

              <input
                value={editTask.title}
                onChange={(e) =>
                  setEditTask({ ...editTask, title: e.target.value })
                }
                placeholder="Task title"
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  outline: "none",
                }}
              />

              <div style={{ height: 12 }} />

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <label style={{ fontWeight: 900, opacity: 0.9 }}>Type</label>
                <select
                  value={editTask.type}
                  onChange={(e) =>
                    setEditTask({ ...editTask, type: e.target.value as TaskType })
                  }
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    outline: "none",
                  }}
                >
                  <option value="habit">Habit</option>
                  <option value="single">Single</option>
                </select>

                {editTask.type === "habit" ? (
                  <>
                    <label style={{ fontWeight: 900, opacity: 0.9 }}>
                      Frequency
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={editTask.freq_times ?? 1}
                      onChange={(e) =>
                        setEditTask({
                          ...editTask,
                          freq_times: sanitizeTimes(e.target.value),
                        })
                      }
                      style={{
                        width: 90,
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        outline: "none",
                      }}
                    />
                    <span style={{ opacity: 0.85 }}>x per</span>
                    <select
                      value={(editTask.freq_per ?? "week") as FrequencyUnit}
                      onChange={(e) =>
                        setEditTask({
                          ...editTask,
                          freq_per: e.target.value as FrequencyUnit,
                        })
                      }
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        outline: "none",
                      }}
                    >
                      <option value="day">day</option>
                      <option value="week">week</option>
                      <option value="month">month</option>
                      <option value="year">year</option>
                    </select>
                  </>
                ) : null}
              </div>

              <div style={{ height: 12 }} />

              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>
                  Scheduled days
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DOW.map((d) => {
                    const selected = (editTask.scheduled_days ?? [
                      0, 1, 2, 3, 4, 5, 6,
                    ]).includes(d.n);
                    return (
                      <button
                        key={d.n}
                        type="button"
                        onClick={() =>
                          toggleDay(d.n, editTask.scheduled_days, (v) =>
                            setEditTask({ ...editTask, scheduled_days: v })
                          )
                        }
                        disabled={busy}
                        style={{
                          padding: "8px 10px",
                          borderRadius: 999,
                          border: `1px solid ${
                            selected ? theme.accent.primary : "var(--border)"
                          }`,
                          background: selected
                            ? "rgba(255,255,255,0.04)"
                            : "transparent",
                          color: "var(--text)",
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>

                <div style={{ marginTop: 10, opacity: 0.85 }}>
                  Selected: <b>{fmtScheduledDays(editTask.scheduled_days)}</b>
                </div>
              </div>

              <div style={{ height: 12 }} />

              <div
                style={{
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 900 }}>Weekly skips allowed</div>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={editTask.weekly_skips_allowed ?? 0}
                  onChange={(e) =>
                    setEditTask({
                      ...editTask,
                      weekly_skips_allowed: sanitizeSkips(e.target.value),
                    })
                  }
                  style={{
                    width: 90,
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    outline: "none",
                  }}
                />
              </div>

              <div style={{ height: 14 }} />

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    setEditOpen(false);
                    setEditTask(null);
                  }}
                  disabled={busy}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 900,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={() => saveEdit(editTask)}
                  disabled={busy}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${theme.accent.primary}`,
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 900,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
