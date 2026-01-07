// FORCE NEW COMMIT: 2026-01-06-STATS-PAGE
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

  // optional (if you added these already)
  scheduled_days?: number[] | null; // 0=Sun..6=Sat
};

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  proof_type: "photo" | "override";
  proof_note: string | null;
  photo_path: string | null;
  completed_at: string;
};

type Mode = "day" | "week" | "month" | "year";

// ---------- Local time helpers ----------
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// Week starts Monday
function startOfWeekLocal(d: Date) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // Monday=0
  const start = startOfDayLocal(d);
  start.setDate(start.getDate() - diff);
  return start;
}

function startOfMonthLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfYearLocal(d: Date) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}

function periodStart(mode: Mode, now: Date) {
  switch (mode) {
    case "day":
      return startOfDayLocal(now);
    case "week":
      return startOfWeekLocal(now);
    case "month":
      return startOfMonthLocal(now);
    case "year":
      return startOfYearLocal(now);
  }
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function formatModeTitle(mode: Mode) {
  switch (mode) {
    case "day":
      return "Day";
    case "week":
      return "Week";
    case "month":
      return "Month";
    case "year":
      return "Year";
  }
}

function formatHeaderDate(now: Date) {
  return now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function requiredForTaskInMode(task: TaskRow, mode: Mode) {
  // We only count tasks whose freq_per matches the toggle (day/week/month/year)
  // Single tasks: include only in "year" (easy + intuitive). You can change later.
  if (task.type === "single") return mode === "year" ? 1 : 0;

  const per = (task.freq_per ?? "week") as FrequencyUnit;
  if (per !== mode) return 0;

  return Math.max(1, Number(task.freq_times ?? 1));
}

function isTaskScheduledToday(task: TaskRow, now: Date) {
  const days = task.scheduled_days ?? null;
  if (!days || days.length === 0) return true;
  return days.includes(now.getDay());
}

export default function StatsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("day");

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  // tick so "day" changes without refresh
  const [todayKey, setTodayKey] = useState<string>(() => new Date().toDateString());
  useEffect(() => {
    const t = setInterval(() => setTodayKey(new Date().toDateString()), 30_000);
    return () => clearInterval(t);
  }, []);

  const now = useMemo(() => new Date(), [todayKey]);

  // Auth
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

  async function loadStats(uid: string, modeNow: Mode) {
    setLoading(true);
    setStatus(null);

    const n = new Date();

    // We need enough completion history for the charts:
    // day: 7 days, week: 8 weeks, month: 12 months, year: 5 years
    let earliest = startOfDayLocal(n);
    if (modeNow === "day") {
      earliest = startOfDayLocal(n);
      earliest.setDate(earliest.getDate() - 6);
    } else if (modeNow === "week") {
      earliest = startOfWeekLocal(n);
      earliest.setDate(earliest.getDate() - 7 * 7); // 8 weeks range (approx)
    } else if (modeNow === "month") {
      earliest = startOfMonthLocal(n);
      earliest.setMonth(earliest.getMonth() - 11);
    } else {
      earliest = startOfYearLocal(n);
      earliest.setFullYear(earliest.getFullYear() - 4);
    }

    // 1) tasks (active only)
    const { data: tasksData, error: tasksErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", uid)
      .eq("archived", false)
      .order("created_at", { ascending: false });

    if (tasksErr) {
      console.error(tasksErr);
      setStatus(tasksErr.message);
      setTasks([]);
      setCompletions([]);
      setLoading(false);
      return;
    }

    // 2) completions since earliest
    const { data: compData, error: compErr } = await supabase
      .from("completions")
      .select("*")
      .eq("user_id", uid)
      .gte("completed_at", earliest.toISOString())
      .order("completed_at", { ascending: false })
      .limit(5000);

    if (compErr) {
      console.error(compErr);
      setStatus(compErr.message);
      setTasks((tasksData ?? []) as TaskRow[]);
      setCompletions([]);
      setLoading(false);
      return;
    }

    setTasks((tasksData ?? []) as TaskRow[]);
    setCompletions((compData ?? []) as CompletionRow[]);
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setCompletions([]);
      setLoading(false);
      return;
    }
    loadStats(userId, mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, mode, todayKey]);

  // Group completions by task for quick counting
  const completionsByTask = useMemo(() => {
    const m: Record<string, CompletionRow[]> = {};
    for (const c of completions) (m[c.task_id] ??= []).push(c);
    return m;
  }, [completions]);

  function countDoneInCurrentPeriod(taskId: string) {
    const start = periodStart(mode, now).getTime();
    const list = completionsByTask[taskId] ?? [];
    let count = 0;
    for (const c of list) {
      if (new Date(c.completed_at).getTime() >= start) count++;
    }
    return count;
  }

  // Build per-task progress for the selected mode
  const taskProgress = useMemo(() => {
    const items = tasks
      .filter((t) => !t.archived)
      .map((t) => {
        const required = requiredForTaskInMode(t, mode);

        // For Day mode, if you have scheduled_days set, only count it "due" if today is scheduled.
        // Otherwise, include it as due.
        const due =
          mode !== "day" ? required > 0 : required > 0 && isTaskScheduledToday(t, now);

        const done = required > 0 ? countDoneInCurrentPeriod(t.id) : 0;
        const cappedDone = required > 0 ? Math.min(done, required) : 0;
        const pct = required > 0 ? clamp((cappedDone / required) * 100, 0, 100) : 0;

        return { task: t, due, required, done: cappedDone, pct };
      })
      .filter((x) => x.due);

    // Sort: incomplete first, then by lowest %
    items.sort((a, b) => {
      const aDone = a.done >= a.required;
      const bDone = b.done >= b.required;
      if (aDone !== bDone) return aDone ? 1 : -1;
      return a.pct - b.pct;
    });

    return items;
  }, [tasks, mode, todayKey, completionsByTask]);

  const summary = useMemo(() => {
    const due = taskProgress.length;
    const completed = taskProgress.filter((x) => x.done >= x.required).length;
    const remaining = Math.max(0, due - completed);
    const pct = due > 0 ? Math.round((completed / due) * 100) : 0;
    return { due, completed, remaining, pct };
  }, [taskProgress]);

  // ---------- Chart buckets ----------
  const chart = useMemo(() => {
    const n = new Date(now);

    type Bucket = { label: string; start: Date; end: Date; count: number };

    const buckets: Bucket[] = [];

    if (mode === "day") {
      // last 7 days
      for (let i = 6; i >= 0; i--) {
        const d = startOfDayLocal(n);
        d.setDate(d.getDate() - i);
        const end = new Date(d);
        end.setDate(end.getDate() + 1);
        buckets.push({
          label: d.toLocaleDateString(undefined, { weekday: "short" }),
          start: d,
          end,
          count: 0,
        });
      }
    } else if (mode === "week") {
      // last 8 weeks (label by start date)
      const thisWeek = startOfWeekLocal(n);
      for (let i = 7; i >= 0; i--) {
        const start = new Date(thisWeek);
        start.setDate(start.getDate() - i * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        buckets.push({
          label: start.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
          start,
          end,
          count: 0,
        });
      }
    } else if (mode === "month") {
      // last 12 months
      const thisMonth = startOfMonthLocal(n);
      for (let i = 11; i >= 0; i--) {
        const start = new Date(thisMonth);
        start.setMonth(start.getMonth() - i);
        const end = new Date(start);
        end.setMonth(end.getMonth() + 1);
        buckets.push({
          label: start.toLocaleDateString(undefined, { month: "short" }),
          start,
          end,
          count: 0,
        });
      }
    } else {
      // last 5 years
      const thisYear = startOfYearLocal(n);
      for (let i = 4; i >= 0; i--) {
        const start = new Date(thisYear);
        start.setFullYear(start.getFullYear() - i);
        const end = new Date(start);
        end.setFullYear(end.getFullYear() + 1);
        buckets.push({
          label: String(start.getFullYear()),
          start,
          end,
          count: 0,
        });
      }
    }

    // Count completions into buckets
    for (const c of completions) {
      const ts = new Date(c.completed_at).getTime();
      for (const b of buckets) {
        if (ts >= b.start.getTime() && ts < b.end.getTime()) {
          b.count++;
          break;
        }
      }
    }

    const max = Math.max(1, ...buckets.map((b) => b.count));

    return { buckets, max };
  }, [mode, completions, todayKey]);

  const headerDate = useMemo(() => formatHeaderDate(now), [todayKey]);

  // ---------------- UI ----------------
  if (!userId) {
    return (
      <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Stats</h1>
          <div style={{ opacity: 0.8 }}>
            Log in to see your stats.
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${theme.accent.primary}`, color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Home
            </Link>
            <Link href="/profile" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Log in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Stats</h1>
            <div style={{ opacity: 0.85, marginTop: 6 }}>
              <b>{headerDate}</b> • Logged in as <b>{sessionEmail}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${theme.accent.primary}`, color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Home
            </Link>
            <Link href="/tasks" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Tasks
            </Link>
            <Link href="/completed" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Completed
            </Link>
          </div>
        </div>

        {status ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
            {status}
          </div>
        ) : null}

        {/* Toggles */}
        <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.02)", boxShadow: "0 10px 24px rgba(0,0,0,0.20)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>{formatModeTitle(mode)} view</div>
              <div style={{ opacity: 0.8, marginTop: 4 }}>
                Due tasks: <b>{summary.due}</b> • Completed: <b>{summary.completed}</b> • Remaining: <b>{summary.remaining}</b> • <b>{summary.pct}%</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["day", "week", "month", "year"] as Mode[]).map((m) => {
                const active = m === mode;
                return (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    disabled={loading}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: active ? `1px solid ${theme.accent.primary}` : "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text)",
                      fontWeight: 900,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.7 : 1,
                    }}
                    type="button"
                  >
                    {formatModeTitle(m)}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ height: 14 }} />

          {/* Completion % bar (orange) */}
          <div style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 999, overflow: "hidden", height: 12, background: "rgba(255,255,255,0.04)" }}>
            <div style={{ width: `${summary.pct}%`, height: "100%", background: "#f59e0b" }} />
          </div>
        </section>

        {/* Chart */}
        <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.02)", boxShadow: "0 10px 24px rgba(0,0,0,0.20)" }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>Completions over time</div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>
            Bars show total completions in each bucket.
          </div>

          <div style={{ height: 14 }} />

          {loading ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              Loading…
            </div>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", height: 180 }}>
              {chart.buckets.map((b) => {
                const h = Math.round((b.count / chart.max) * 160);
                return (
                  <div key={b.label} style={{ flex: 1, minWidth: 24, display: "flex", flexDirection: "column", justifyContent: "flex-end", gap: 6, alignItems: "center" }}>
                    <div
                      title={`${b.count} completions`}
                      style={{
                        width: "100%",
                        height: h,
                        borderRadius: 10,
                        border: "1px solid var(--border)",
                        background: "rgba(255,255,255,0.06)",
                      }}
                    />
                    <div style={{ fontSize: 12, opacity: 0.8, textAlign: "center" }}>{b.label}</div>
                    <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 900 }}>{b.count}</div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Per-task progress list */}
        <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.02)", boxShadow: "0 10px 24px rgba(0,0,0,0.20)" }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>Progress by task</div>
          <div style={{ opacity: 0.8, marginTop: 4 }}>
            Only tasks that apply to the selected toggle are shown.
          </div>

          <div style={{ height: 12 }} />

          {loading ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              Loading…
            </div>
          ) : taskProgress.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              No tasks apply to <b>{formatModeTitle(mode)}</b> right now.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {taskProgress.map(({ task, required, done, pct }) => (
                <div key={task.id} style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div>
                      <div style={{ fontWeight: 900 }}>{task.title}</div>
                      <div style={{ opacity: 0.8, marginTop: 4 }}>
                        Progress: <b>{done}/{required}</b> • <b>{Math.round(pct)}%</b>
                      </div>
                    </div>

                    <div style={{ opacity: 0.8, fontWeight: 900 }}>
                      {done >= required ? "✅ Completed" : "⏳ In progress"}
                    </div>
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 999, overflow: "hidden", height: 10, background: "rgba(255,255,255,0.04)" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: "#f59e0b" }} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
