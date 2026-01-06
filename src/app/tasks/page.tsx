// FORCE NEW COMMIT: 2026-01-06-1505
// src/app/tasks/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "@/UI/theme";
import { supabase } from "@/lib/supabaseClient";

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
};

function formatFrequency(t: TaskRow) {
  if (t.type !== "habit") return "";
  const times = Math.max(1, Number(t.freq_times ?? 1));
  const per = (t.freq_per ?? "week") as FrequencyUnit;
  return `${times}x per ${per}`;
}

export default function Page() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // create task
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [times, setTimes] = useState<number>(3);
  const [per, setPer] = useState<FrequencyUnit>("week");

  const [showArchived, setShowArchived] = useState(false);

  // session + auth listener
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

  // load tasks whenever userId becomes available
  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    loadTasks(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => (showArchived ? true : !t.archived));
  }, [tasks, showArchived]);

  async function addTask() {
    if (!userId) return;
    const clean = title.trim();
    if (!clean) return;

    setBusy(true);
    setStatus(null);

    const payload = {
      user_id: userId,
      title: clean,
      type,
      freq_times: type === "habit" ? Math.max(1, Number(times) || 1) : null,
      freq_per: type === "habit" ? per : null,
      archived: false,
    };

    const { data, error } = await supabase
      .from("tasks")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      console.error(error);
      setStatus(error.message);
      setBusy(false);
      return;
    }

    setTasks((prev) => [data as TaskRow, ...prev]);
    setTitle("");
    setBusy(false);
  }

  async function updateTask(id: string, patch: Partial<TaskRow>) {
    if (!userId) return;

    // optimistic UI
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));

    const { error } = await supabase.from("tasks").update(patch).eq("id", id);

    if (error) {
      console.error(error);
      setStatus(error.message);
      // reload to recover consistency
      await loadTasks(userId);
    }
  }

  async function deleteTask(id: string) {
    if (!userId) return;
    const ok = window.confirm("Delete this task? This cannot be undone.");
    if (!ok) return;

    // optimistic UI
    const snapshot = tasks;
    setTasks((prev) => prev.filter((t) => t.id !== id));

    const { error } = await supabase.from("tasks").delete().eq("id", id);

    if (error) {
      console.error(error);
      setStatus(error.message);
      setTasks(snapshot);
    }
  }

  // ---------- UI ----------

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
        <div style={{ maxWidth: 820, margin: "0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
          <p style={{ margin: "8px 0 0 0", opacity: 0.8 }}>
            You must be logged in to manage tasks.
          </p>

          <div style={{ height: 14 }} />

          <section
            style={{
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 16,
              background: "rgba(255,255,255,0.02)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
            }}
          >
            <div style={{ opacity: 0.9 }}>
              {sessionEmail ? (
                <>Session detected, but no user loaded — try refreshing.</>
              ) : (
                <>Go to Profile and log in.</>
              )}
            </div>

            <div style={{ height: 12 }} />

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
              Go to Profile
            </Link>
          </section>
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
      {/* Dropdown styling fix (white on dark) */}
      <style>{`
        select.duoSelect, select.duoSelect option {
          color: #fff !important;
          background: #111 !important;
        }
      `}</style>

      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
            <p style={{ margin: "6px 0 0 0", opacity: 0.8 }}>
              Logged in as <b>{sessionEmail}</b>
            </p>
          </div>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.02)",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>

        {/* Create Task */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task name…"
              onKeyDown={(e) => e.key === "Enter" && addTask()}
              style={{
                flex: "1 1 260px",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                outline: "none",
              }}
            />

            {/* Type toggle */}
            <div
              style={{
                display: "flex",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <ToggleButton
                active={type === "habit"}
                onClick={() => setType("habit")}
                label="Habit"
              />
              <ToggleButton
                active={type === "single"}
                onClick={() => setType("single")}
                label="Single"
              />
            </div>

            {/* Frequency (habit only) */}
            {type === "habit" && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ opacity: 0.85 }}>Times</span>
                <input
                  type="number"
                  min={1}
                  value={times}
                  onChange={(e) => setTimes(Number(e.target.value))}
                  style={{
                    width: 84,
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    outline: "none",
                  }}
                />
                <span style={{ opacity: 0.85 }}>per</span>
                <select
                  className="duoSelect"
                  value={per}
                  onChange={(e) => setPer(e.target.value as FrequencyUnit)}
                  style={{
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "#111",
                    color: "#fff",
                    outline: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="day">Day</option>
                  <option value="week">Week</option>
                  <option value="month">Month</option>
                  <option value="year">Year</option>
                </select>
              </div>
            )}

            <button
              onClick={addTask}
              disabled={busy}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                background: "transparent",
                color: "var(--text)",
                fontWeight: 800,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
              type="button"
            >
              Add
            </button>
          </div>
        </section>

        {/* Status */}
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

        {/* List */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loading ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 18,
                opacity: 0.85,
              }}
            >
              Loading tasks…
            </div>
          ) : visibleTasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 18,
                opacity: 0.85,
              }}
            >
              No tasks yet{showArchived ? "." : " (archived are hidden)."}
            </div>
          ) : (
            visibleTasks.map((t) => (
              <TaskRowView
                key={t.id}
                task={t}
                onSetType={(nextType) => {
                  if (nextType === "single") {
                    updateTask(t.id, {
                      type: "single",
                      freq_times: null,
                      freq_per: null,
                    });
                  } else {
                    updateTask(t.id, {
                      type: "habit",
                      freq_times: t.freq_times ?? 3,
                      freq_per: t.freq_per ?? "week",
                    });
                  }
                }}
                onUpdateFrequency={(nextTimes, nextPer) =>
                  updateTask(t.id, {
                    freq_times: Math.max(1, Number(nextTimes) || 1),
                    freq_per: nextPer,
                  })
                }
                onArchive={() => updateTask(t.id, { archived: true })}
                onUnarchive={() => updateTask(t.id, { archived: false })}
                onDelete={() => deleteTask(t.id)}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
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

function TaskRowView({
  task,
  onArchive,
  onUnarchive,
  onDelete,
  onSetType,
  onUpdateFrequency,
}: {
  task: TaskRow;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onSetType: (t: TaskType) => void;
  onUpdateFrequency: (times: number, per: FrequencyUnit) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 14,
        background: "rgba(255,255,255,0.02)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 220, flex: "1 1 260px" }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{task.title}</div>
        <div style={{ opacity: 0.8, marginTop: 4 }}>
          {task.type === "habit" ? <>Habit • {formatFrequency(task)}</> : <>Single</>}
          {task.archived ? <span> • Archived</span> : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        {/* Type toggle */}
        <div
          style={{
            display: "flex",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <ToggleButton
            active={task.type === "habit"}
            onClick={() => onSetType("habit")}
            label="Habit"
          />
          <ToggleButton
            active={task.type === "single"}
            onClick={() => onSetType("single")}
            label="Single"
          />
        </div>

        {/* Frequency editor */}
        {task.type === "habit" && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ opacity: 0.85 }}>Times</span>
            <input
              type="number"
              min={1}
              value={task.freq_times ?? 3}
              onChange={(e) => onUpdateFrequency(Number(e.target.value), task.freq_per ?? "week")}
              style={{
                width: 84,
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                outline: "none",
              }}
            />
            <span style={{ opacity: 0.85 }}>per</span>
            <select
              className="duoSelect"
              value={task.freq_per ?? "week"}
              onChange={(e) => onUpdateFrequency(task.freq_times ?? 3, e.target.value as FrequencyUnit)}
              style={{
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "#111",
                color: "#fff",
                outline: "none",
                cursor: "pointer",
              }}
            >
              <option value="day">Day</option>
              <option value="week">Week</option>
              <option value="month">Month</option>
              <option value="year">Year</option>
            </select>
          </div>
        )}

        {/* Archive */}
        {task.archived ? (
          <button onClick={onUnarchive} style={actionBtnStyle()} type="button">
            Unarchive
          </button>
        ) : (
          <button onClick={onArchive} style={actionBtnStyle()} type="button">
            Archive
          </button>
        )}

        {/* Delete */}
        <button
          onClick={onDelete}
          style={{ ...actionBtnStyle(), borderColor: "rgba(255, 80, 80, 0.55)" }}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function actionBtnStyle(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontWeight: 900,
    cursor: "pointer",
  };
}
