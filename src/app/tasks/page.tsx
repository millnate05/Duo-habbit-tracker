"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

  scheduled_days: number[] | null; // null => every day
  weekly_skips_allowed: number;
};

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  completed_at: string;
};

// ---------- Home-card palette + icon helpers ----------
type TaskColor = { bg: string; text: "#000" | "#fff" };

const TASK_COLORS: TaskColor[] = [
  { bg: "#F59E0B", text: "#000" },
  { bg: "#3B82F6", text: "#fff" },
  { bg: "#22C55E", text: "#000" },
  { bg: "#EF4444", text: "#fff" },
  { bg: "#A855F7", text: "#fff" },
  { bg: "#06B6D4", text: "#000" },
  { bg: "#F97316", text: "#000" },
  { bg: "#84CC16", text: "#000" },
  { bg: "#0EA5E9", text: "#000" },
  { bg: "#111827", text: "#fff" },
];

function colorIndexFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % TASK_COLORS.length;
}

type IconKind = "water" | "lift" | "run" | "calendar" | "check";

function pickIconKind(title: string): IconKind {
  const t = title.toLowerCase();
  if (t.includes("water") || t.includes("hydrate") || t.includes("drink")) return "water";
  if (
    t.includes("lift") ||
    t.includes("weights") ||
    t.includes("weight") ||
    t.includes("gym") ||
    t.includes("bench") ||
    t.includes("squat") ||
    t.includes("deadlift") ||
    t.includes("workout") ||
    t.includes("train")
  )
    return "lift";
  if (t.includes("run") || t.includes("cardio") || t.includes("walk") || t.includes("steps")) return "run";
  if (t.includes("calendar") || t.includes("schedule") || t.includes("plan")) return "calendar";
  return "check";
}

function MiniIcon({ kind }: { kind: IconKind }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24" };

  switch (kind) {
    case "water":
      return (
        <svg {...common} aria-label="water">
          <path
            d="M12 2c-2.2 4.2-6 7.3-6 11.2A6 6 0 0 0 12 19a6 6 0 0 0 6-5.8C18 9.3 14.2 6.2 12 2z"
            fill="currentColor"
            opacity="0.92"
          />
        </svg>
      );

    case "lift":
      return (
        <svg {...common} aria-label="dumbbell">
          <rect x="3" y="10" width="3" height="4" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="6.5" y="9" width="2.5" height="6" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="9.8" y="11" width="4.4" height="2" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="15" y="9" width="2.5" height="6" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="18" y="10" width="3" height="4" rx="1" fill="currentColor" opacity="0.92" />
        </svg>
      );

    case "run":
      return (
        <svg {...common} aria-label="run">
          <circle cx="15.6" cy="6.6" r="1.6" fill="currentColor" opacity="0.92" />
          <path
            d="M9.2 20.6l2.1-4.7 2.4 1.2 2-3.8-3-1.7-1.1-2.3-2.7 1.2 1 2.2-2.5 3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
        </svg>
      );

    case "calendar":
      return (
        <svg {...common} aria-label="calendar">
          <rect x="5" y="6.5" width="14" height="13" rx="3" fill="currentColor" opacity="0.92" />
          <rect x="7.2" y="9.1" width="9.6" height="1.8" rx="0.9" fill="rgba(0,0,0,0.25)" />
          <rect x="7.2" y="12" width="4.2" height="4.2" rx="1.2" fill="rgba(0,0,0,0.25)" />
        </svg>
      );

    default:
      return (
        <svg {...common} aria-label="check">
          <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.92" />
          <path
            d="M8.3 12.4l2.2 2.2 5.2-5.2"
            fill="none"
            stroke="rgba(0,0,0,0.28)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

// ---------- Progress helpers ----------
function startOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDayLocal(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function startOfWeekLocal(d: Date) {
  const x = startOfDayLocal(d);
  const day = x.getDay();
  x.setDate(x.getDate() - day);
  return x;
}
function endOfWeekLocal(d: Date) {
  const s = startOfWeekLocal(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  return endOfDayLocal(e);
}
function startOfMonthLocal(d: Date) {
  const x = startOfDayLocal(d);
  x.setDate(1);
  return x;
}
function endOfMonthLocal(d: Date) {
  const s = startOfMonthLocal(d);
  const e = new Date(s);
  e.setMonth(e.getMonth() + 1);
  e.setDate(0);
  return endOfDayLocal(e);
}
function startOfYearLocal(d: Date) {
  const x = startOfDayLocal(d);
  x.setMonth(0, 1);
  return x;
}
function endOfYearLocal(d: Date) {
  const s = startOfYearLocal(d);
  const e = new Date(s);
  e.setFullYear(e.getFullYear() + 1);
  e.setDate(0);
  return endOfDayLocal(e);
}
function getPeriodBounds(unit: FrequencyUnit, now: Date) {
  if (unit === "day") return { start: startOfDayLocal(now), end: endOfDayLocal(now) };
  if (unit === "week") return { start: startOfWeekLocal(now), end: endOfWeekLocal(now) };
  if (unit === "month") return { start: startOfMonthLocal(now), end: endOfMonthLocal(now) };
  return { start: startOfYearLocal(now), end: endOfYearLocal(now) };
}
function safeMs(s: string) {
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? ms : 0;
}

export default function TasksPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);

  // Auth
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) setStatus(error.message);
      setUserId(data.session?.user?.id ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Load when user changes
  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setCompletions([]);
      setLoading(false);
      return;
    }
    void loadTasks(userId);
    void loadCompletions(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((t) => t.archived), [tasks]);

  // completion map
  const completionMap = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const c of completions) {
      const arr = m.get(c.task_id) ?? [];
      arr.push(safeMs(c.completed_at));
      m.set(c.task_id, arr);
    }
    for (const [k, arr] of m.entries()) arr.sort((a, b) => a - b);
    return m;
  }, [completions]);

  function getProgressForTask(t: TaskRow) {
    const now = new Date();
    const arr = completionMap.get(t.id) ?? [];

    if (t.type === "single") {
      const { start, end } = getPeriodBounds("day", now);
      const s = start.getTime();
      const e = end.getTime();
      const done = arr.some((ms) => ms >= s && ms <= e);
      return { done: done ? 1 : 0, target: 1 };
    }

    const per = t.freq_per ?? "week";
    const target = Math.max(1, t.freq_times ?? 1);

    const { start, end } = getPeriodBounds(per, now);
    const s = start.getTime();
    const e = end.getTime();

    const done = arr.reduce((acc, ms) => (ms >= s && ms <= e ? acc + 1 : acc), 0);
    return { done: Math.min(done, target), target };
  }

  async function loadTasks(uid: string) {
    setLoading(true);
    setStatus(null);
    try {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", uid)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTasks((data ?? []) as TaskRow[]);
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to load tasks.");
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadCompletions(uid: string) {
    try {
      const { data, error } = await supabase
        .from("completions")
        .select("id,user_id,task_id,completed_at")
        .eq("user_id", uid)
        .order("completed_at", { ascending: false })
        .limit(1200);

      if (error) throw error;
      setCompletions((data ?? []) as CompletionRow[]);
    } catch {
      setCompletions([]);
    }
  }

  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
        paddingBottom: 60,
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>

          <Link
            href="/shared"
            style={{
              display: "inline-block",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 900,
              opacity: 0.9,
            }}
          >
            Shared
          </Link>
        </div>

        {status ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 14 }}>
            {status}
          </div>
        ) : null}

        <div style={{ height: 16 }} />

        {loading ? (
          <div style={{ opacity: 0.8 }}>Loading…</div>
        ) : activeTasks.length === 0 ? (
          <div style={{ opacity: 0.8 }}>No tasks yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeTasks.map((t) => {
              const { bg, text } = TASK_COLORS[colorIndexFromId(t.id)];
              const textIsBlack = text === "#000";
              const icon = pickIconKind(t.title);

              const { done, target } = getProgressForTask(t);
              const pct = target <= 0 ? 0 : Math.max(0, Math.min(1, done / target));

              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => router.push(`/tasks/${t.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") router.push(`/tasks/${t.id}`);
                  }}
                  style={{
                    width: "100%",
                    borderRadius: 18,
                    background: bg,
                    color: text,
                    position: "relative",
                    overflow: "hidden",
                    padding: "10px 12px", // ✅ shorter card height
                    boxShadow: "0 10px 22px rgba(0,0,0,0.45)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        flex: "0 0 auto",
                        width: 30,
                        height: 30,
                        borderRadius: 12,
                        background: textIsBlack ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.16)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: text,
                      }}
                    >
                      <MiniIcon kind={icon} />
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 15,
                          lineHeight: 1.05,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={t.title}
                      >
                        {t.title}
                      </div>

                      {/* Progress bar only (no % line) */}
                      <div
                        style={{
                          marginTop: 8,
                          height: 9,
                          borderRadius: 999,
                          background: textIsBlack ? "rgba(0,0,0,0.16)" : "rgba(255,255,255,0.22)",
                          overflow: "hidden",
                        }}
                        aria-label="progress"
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${Math.round(pct * 100)}%`,
                            background: textIsBlack ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.55)",
                            borderRadius: 999,
                            transition: "width 220ms ease",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.95, whiteSpace: "nowrap" }}>
                      {done}/{target}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ✅ ALWAYS render the create button (even if 0 tasks) */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <button
            type="button"
            onClick={() => router.push("/tasks/create")}
            style={{
              width: "min(520px, 100%)",
              padding: "14px 16px",
              borderRadius: 16,
              border: `1px solid ${theme.accent.primary}`,
              background: theme.accent.primary,
              color: "#000",
              fontWeight: 900,
              fontSize: 16,
              cursor: "pointer",
              boxShadow: "0 12px 24px rgba(0,0,0,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
            }}
            aria-label="Create new task"
          >
            <span
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: "rgba(0,0,0,0.18)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 20,
                lineHeight: 0,
                fontWeight: 900,
              }}
            >
              +
            </span>
            Create new task
          </button>
        </div>

        {/* Archived list (unchanged, compact) */}
        {!loading && archivedTasks.length > 0 ? (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: 10 }}>Archived</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {archivedTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => router.push(`/tasks/${t.id}`)}
                  style={{
                    textAlign: "left",
                    padding: 12,
                    borderRadius: 14,
                    border: "1px solid var(--border)",
                    background: "rgba(255,255,255,0.02)",
                    color: "var(--text)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>{t.title}</div>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
