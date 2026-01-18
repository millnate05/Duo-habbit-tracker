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
  proof_type: "photo" | "override";
  proof_note: string | null;
  photo_path: string | null;
  completed_at: string;
};

type ReminderRow = {
  id: string;
  user_id: string;
  task_id: string;
  enabled: boolean;
  tz: string;
  reminder_time: string; // "HH:MM:SS"
  scheduled_days: number[] | null;
  next_fire_at: string | null;
  created_at?: string;
  updated_at?: string;
};

type Cadence = "daily" | "weekly";

type ReminderDraft = {
  enabled: boolean;
  timezone: string;
  time_of_day: string; // "HH:MM"
  cadence: Cadence;
  days_of_week: number[]; // weekly: exactly ONE day (0..6)
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

function guessTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

function parseBoundedInt(
  raw: string,
  { min, max, fallback }: { min: number; max: number; fallback: number }
) {
  const s = raw.trim();
  if (s === "") return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function isTimeStringValidHHMM(v: string) {
  if (!/^\d{2}:\d{2}$/.test(v)) return false;
  const [hh, mm] = v.split(":").map((x) => Number(x));
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return false;
  if (hh < 0 || hh > 23) return false;
  if (mm < 0 || mm > 59) return false;
  return true;
}

function onNumberFieldChange(setter: (v: string) => void, raw: string) {
  if (raw === "") return setter("");
  if (/^\d+$/.test(raw)) return setter(raw);
}

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
  const common = { width: 26, height: 26, viewBox: "0 0 24 24" };

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

const globalFixesCSS = `
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type="number"] { -moz-appearance: textfield; }

@media (prefers-reduced-motion: reduce) {
  .dht-anim { transition: none !important; animation: none !important; }
}
`;

// ---------- Progress helpers ----------
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function startOfWeek(d: Date) {
  // Sunday-start (0)
  const x = startOfDay(d);
  const dow = x.getDay(); // 0..6
  x.setDate(x.getDate() - dow);
  return x;
}
function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}
function startOfYear(d: Date) {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

function getPeriodStart(freq: FrequencyUnit, now: Date) {
  if (freq === "day") return startOfDay(now);
  if (freq === "week") return startOfWeek(now);
  if (freq === "month") return startOfMonth(now);
  return startOfYear(now);
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function BigPlusButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Create task"
      style={{
        position: "fixed",
        right: 18,
        bottom: 18,
        width: 60,
        height: 60,
        borderRadius: 999,
        border: `1px solid ${theme.accent.primary}`,
        background: theme.accent.primary,
        color: "#000",
        fontWeight: 900,
        fontSize: 28,
        lineHeight: "60px",
        textAlign: "center",
        boxShadow: "0 12px 24px rgba(0,0,0,0.45)",
        cursor: "pointer",
        zIndex: 60,
      }}
    >
      +
    </button>
  );
}

function ProgressBar({
  ratio,
  textColor,
  bgIsDark,
}: {
  ratio: number;
  textColor: string;
  bgIsDark: boolean;
}) {
  const r = clamp01(ratio);
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          overflow: "hidden",
          border: bgIsDark ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(0,0,0,0.18)",
          background: bgIsDark ? "rgba(255,255,255,0.14)" : "rgba(0,0,0,0.10)",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${Math.round(r * 100)}%`,
            background: bgIsDark ? "rgba(255,255,255,0.72)" : "rgba(0,0,0,0.55)",
          }}
        />
      </div>
      <div style={{ marginTop: 6, fontSize: 12, fontWeight: 900, opacity: 0.92, color: textColor }}>
        {Math.round(r * 100)}%
      </div>
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [remindersByTask, setRemindersByTask] = useState<Record<string, ReminderRow[]>>({});

  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [editFreqTimesStr, setEditFreqTimesStr] = useState<string>("1");
  const [editWeeklySkipsStr, setEditWeeklySkipsStr] = useState<string>("0");
  const [editReminders, setEditReminders] = useState<ReminderDraft[]>([]);

  const baseField: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    outline: "none",
    width: "100%",
  };

  const cleanSelect: React.CSSProperties = {
    ...baseField,
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
    paddingRight: 38,
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27%3E%3Cpath d=%27M6 8l4 4 4-4%27 fill=%27none%27 stroke=%27%23c9c9c9%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")',
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    backgroundSize: "16px 16px",
  };

  const cleanNumber: React.CSSProperties = {
    ...baseField,
    MozAppearance: "textfield",
  };

  // -----------------------------
  // Auth: keep userId in sync
  // -----------------------------
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) setStatus(error.message);
      const u = data.session?.user ?? null;
      setUserId(u?.id ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user ?? null;
      setUserId(u?.id ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // -----------------------------
  // Load data when user changes
  // -----------------------------
  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setCompletions([]);
      setRemindersByTask({});
      setLoading(false);
      return;
    }

    void loadTasks(userId);
    void loadCompletions(userId);
    void loadReminders(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((t) => t.archived), [tasks]);

  // -----------------------------
  // progress (per task, current period)
  // -----------------------------
  const progressByTask = useMemo(() => {
    const map: Record<
      string,
      { done: number; target: number; ratio: number; periodStartISO: string }
    > = {};

    const now = new Date();
    for (const t of tasks) {
      const target =
        t.type === "habit" ? Math.max(1, Number(t.freq_times ?? 1)) : 1;

      const freq: FrequencyUnit = t.type === "habit" ? (t.freq_per ?? "week") : "day";
      const periodStart = getPeriodStart(freq, now);
      const periodStartISO = periodStart.toISOString();

      // Count completions since periodStart
      let done = 0;
      for (const c of completions) {
        if (c.task_id !== t.id) continue;
        if (c.completed_at >= periodStartISO) done += 1;
      }

      const ratio = clamp01(done / target);
      map[t.id] = { done, target, ratio, periodStartISO };
    }

    return map;
  }, [tasks, completions]);

  // -----------------------------
  // reminders helpers for edit overlay
  // (kept so edit still works; removed from task cards)
  // -----------------------------
  function defaultReminderDraft(): ReminderDraft {
    return {
      enabled: true,
      timezone: guessTimeZone(),
      time_of_day: "09:00",
      cadence: "daily",
      days_of_week: [1],
    };
  }

  function normalizeDraft(d: ReminderDraft): ReminderDraft {
    const tz = (d.timezone || guessTimeZone()).trim() || guessTimeZone();
    const time = isTimeStringValidHHMM(d.time_of_day) ? d.time_of_day : "09:00";
    if (d.cadence === "daily") {
      return { ...d, timezone: tz, time_of_day: time, days_of_week: [1] };
    }
    const oneDay = d.days_of_week?.length ? d.days_of_week[0] : 1;
    const clamped = Math.max(0, Math.min(6, oneDay));
    return { ...d, timezone: tz, time_of_day: time, days_of_week: [clamped] };
  }

  function toDraftFromRow(r: ReminderRow): ReminderDraft {
    const tz = r.tz || guessTimeZone();
    const timeHHMM = (r.reminder_time || "09:00:00").slice(0, 5);
    const days = Array.isArray(r.scheduled_days) ? r.scheduled_days : null;

    if (!days || days.length === 0) {
      return {
        enabled: !!r.enabled,
        timezone: tz,
        time_of_day: timeHHMM,
        cadence: "daily",
        days_of_week: [1],
      };
    }

    return {
      enabled: !!r.enabled,
      timezone: tz,
      time_of_day: timeHHMM,
      cadence: "weekly",
      days_of_week: [days[0]],
    };
  }

  function draftToDbFields(taskId: string, d: ReminderDraft) {
    const nd = normalizeDraft(d);
    const timeHHMMSS = `${nd.time_of_day}:00`;
    const scheduled_days = nd.cadence === "daily" ? null : [nd.days_of_week[0]];
    return {
      task_id: taskId,
      user_id: userId,
      enabled: !!nd.enabled,
      tz: nd.timezone,
      reminder_time: timeHHMMSS,
      scheduled_days,
    };
  }

  function ReminderEditor({
    drafts,
    setDrafts,
  }: {
    drafts: ReminderDraft[];
    setDrafts: (v: ReminderDraft[]) => void;
  }) {
    const hasOne = drafts.length >= 1;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Reminders</div>
          <button
            type="button"
            disabled={busy || hasOne}
            onClick={() => setDrafts([defaultReminderDraft()])}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: `1px solid ${theme.accent.primary}`,
              background: "transparent",
              color: "var(--text)",
              fontWeight: 900,
              cursor: busy || hasOne ? "not-allowed" : "pointer",
              opacity: busy || hasOne ? 0.6 : 1,
            }}
          >
            + Add reminder
          </button>
        </div>

        {drafts.map((d0, idx) => {
          const d = normalizeDraft(d0);

          return (
            <div
              key={`rem-${idx}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 14,
                padding: 12,
                background: "rgba(255,255,255,0.02)",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 900, opacity: 0.95 }}>
                  {d.cadence === "daily"
                    ? `Daily at ${d.time_of_day} (${d.timezone})`
                    : `Weekly on ${DOW.find((x) => x.n === d.days_of_week[0])?.label ?? "?"} at ${d.time_of_day} (${d.timezone})`}
                </div>

                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={d.enabled}
                      disabled={busy}
                      onChange={(e) => {
                        const next = drafts.slice();
                        next[idx] = { ...d, enabled: e.target.checked };
                        setDrafts(next);
                      }}
                    />
                    <span style={{ fontWeight: 900 }}>{d.enabled ? "Enabled" : "Disabled"}</span>
                  </label>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setDrafts([])}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid rgba(255, 99, 99, 0.65)",
                      background: "transparent",
                      color: "var(--text)",
                      fontWeight: 900,
                      cursor: busy ? "not-allowed" : "pointer",
                      opacity: busy ? 0.6 : 1,
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Cadence</div>
                  <select
                    value={d.cadence}
                    disabled={busy}
                    onChange={(e) => {
                      const nextCadence = e.target.value as Cadence;
                      const next = drafts.slice();
                      const patched: ReminderDraft = { ...d, cadence: nextCadence };
                      if (nextCadence === "weekly") patched.days_of_week = [patched.days_of_week[0] ?? 1];
                      next[idx] = patched;
                      setDrafts(next);
                    }}
                    style={cleanSelect}
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>

                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Time</div>
                  <input
                    type="time"
                    value={d.time_of_day}
                    disabled={busy}
                    onChange={(e) => {
                      const next = drafts.slice();
                      next[idx] = { ...d, time_of_day: e.target.value };
                      setDrafts(next);
                    }}
                    style={baseField}
                  />
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Timezone</div>
                  <input
                    value={d.timezone}
                    disabled={busy}
                    onChange={(e) => {
                      const next = drafts.slice();
                      next[idx] = { ...d, timezone: e.target.value };
                      setDrafts(next);
                    }}
                    placeholder="America/Los_Angeles"
                    style={baseField}
                  />
                </div>

                {d.cadence === "weekly" ? (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontWeight: 900, marginBottom: 6 }}>Day of week</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {DOW.map((x) => {
                        const selected = d.days_of_week[0] === x.n;
                        return (
                          <button
                            key={x.n}
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              const next = drafts.slice();
                              next[idx] = { ...d, days_of_week: [x.n] };
                              setDrafts(next);
                            }}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 999,
                              border: `1px solid ${selected ? theme.accent.primary : "var(--border)"}`,
                              background: selected ? "rgba(255,255,255,0.04)" : "transparent",
                              color: "var(--text)",
                              fontWeight: 900,
                              cursor: busy ? "not-allowed" : "pointer",
                              opacity: busy ? 0.6 : 1,
                            }}
                          >
                            {x.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // -----------------------------
  // data loads
  // -----------------------------
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
      // fetch enough history to support month/year progress without being crazy
      const since = new Date();
      since.setDate(since.getDate() - 370);

      const { data, error } = await supabase
        .from("completions")
        .select("id,user_id,task_id,proof_type,proof_note,photo_path,completed_at")
        .eq("user_id", uid)
        .gte("completed_at", since.toISOString())
        .order("completed_at", { ascending: false })
        .limit(2000);

      if (error) throw error;
      setCompletions((data ?? []) as CompletionRow[]);
    } catch {
      setCompletions([]);
    }
  }

  async function loadReminders(uid: string) {
    try {
      const { data, error } = await supabase.from("reminders").select("*").eq("user_id", uid);
      if (error) throw error;

      const rows = (data ?? []) as ReminderRow[];
      const map: Record<string, ReminderRow[]> = {};
      for (const r of rows) {
        if (!map[r.task_id]) map[r.task_id] = [];
        map[r.task_id].push(r);
      }
      for (const k of Object.keys(map)) {
        map[k] = map[k].sort((a, b) => {
          const ea = a.enabled ? 0 : 1;
          const eb = b.enabled ? 0 : 1;
          if (ea !== eb) return ea - eb;
          return (a.created_at ?? "").localeCompare(b.created_at ?? "");
        });
      }
      setRemindersByTask(map);
    } catch {
      setRemindersByTask({});
    }
  }

  // -----------------------------
  // edit overlay open/close
  // -----------------------------
  function openEdit(t: TaskRow) {
    setStatus(null);
    setEditTask({ ...t });
    setEditFreqTimesStr(String(t.freq_times ?? 1));
    setEditWeeklySkipsStr(String(t.weekly_skips_allowed ?? 0));

    const existing = remindersByTask[t.id]?.[0] ?? null;
    setEditReminders(existing ? [toDraftFromRow(existing)] : []);
    setEditOpen(true);
  }

  function closeEdit() {
    if (busy) return;
    setEditOpen(false);
    setEditTask(null);
    setEditReminders([]);
  }

  // -----------------------------
  // CRUD: edit task + reminders (1 per task)
  // -----------------------------
  async function saveEdit(t: TaskRow) {
    if (!userId) return;
    if (busy) return;

    const nextTitle = (t.title ?? "").trim();
    if (!nextTitle) {
      setStatus("Title cannot be empty.");
      return;
    }

    const times = parseBoundedInt(editFreqTimesStr, { min: 1, max: 365, fallback: 1 });
    const skips = parseBoundedInt(editWeeklySkipsStr, { min: 0, max: 7, fallback: 0 });

    setBusy(true);
    setStatus(null);

    try {
      const updatePayload: Partial<TaskRow> = {
        title: nextTitle,
        type: t.type,
        freq_times: t.type === "habit" ? times : null,
        freq_per: t.type === "habit" ? (t.freq_per ?? "week") : null,
        scheduled_days: t.scheduled_days,
        weekly_skips_allowed: skips,
        archived: !!t.archived,
      };

      const { error } = await supabase.from("tasks").update(updatePayload).eq("id", t.id).eq("user_id", userId);
      if (error) throw error;

      const existing = remindersByTask[t.id]?.[0] ?? null;
      const desired = editReminders[0] ? normalizeDraft(editReminders[0]) : null;

      if (!desired && existing) {
        const { error: delErr } = await supabase.from("reminders").delete().eq("id", existing.id).eq("user_id", userId);
        if (delErr) throw delErr;
      } else if (desired && existing) {
        const fields = draftToDbFields(t.id, desired);
        const { error: upErr } = await supabase
          .from("reminders")
          .update({
            enabled: fields.enabled,
            tz: fields.tz,
            reminder_time: fields.reminder_time,
            scheduled_days: fields.scheduled_days,
          })
          .eq("id", existing.id)
          .eq("user_id", userId);
        if (upErr) throw upErr;
      } else if (desired && !existing) {
        const fields = draftToDbFields(t.id, desired);
        const { error: insErr } = await supabase.from("reminders").insert(fields);
        if (insErr) throw insErr;
      }

      await loadTasks(userId);
      await loadReminders(userId);
      await loadCompletions(userId);

      closeEdit();
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to save changes.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleArchive(t: TaskRow) {
    if (!userId) return;
    if (busy) return;

    setBusy(true);
    setStatus(null);
    try {
      const { error } = await supabase
        .from("tasks")
        .update({ archived: !t.archived })
        .eq("id", t.id)
        .eq("user_id", userId);

      if (error) throw error;
      await loadTasks(userId);
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to update archive.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask(t: TaskRow) {
    if (!userId) return;
    if (busy) return;

    const ok = window.confirm(`Delete "${t.title}"? This cannot be undone.`);
    if (!ok) return;

    setBusy(true);
    setStatus(null);
    try {
      await supabase.from("reminders").delete().eq("task_id", t.id).eq("user_id", userId);
      const { error } = await supabase.from("tasks").delete().eq("id", t.id).eq("user_id", userId);
      if (error) throw error;

      await loadTasks(userId);
      await loadReminders(userId);
      await loadCompletions(userId);

      closeEdit();
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to delete task.");
    } finally {
      setBusy(false);
    }
  }

  // -----------------------------
  // lightweight modal shell for edit
  // -----------------------------
  function OverlayShell({
    open,
    title,
    onClose,
    footer,
    children,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    footer?: React.ReactNode;
    children: React.ReactNode;
  }) {
    if (!open) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          zIndex: 80,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          padding: 16,
        }}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 980,
            borderRadius: 18,
            border: "1px solid var(--border)",
            background: "rgba(10,10,10,0.92)",
            backdropFilter: "blur(10px)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "14px 14px 12px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 10,
              borderBottom: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 16 }}>{title}</div>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                fontWeight: 900,
                cursor: "pointer",
              }}
            >
              Close
            </button>
          </div>

          <div style={{ padding: 14 }}>{children}</div>

          {footer ? (
            <div
              style={{
                padding: 14,
                borderTop: "1px solid rgba(255,255,255,0.08)",
                background: "rgba(255,255,255,0.02)",
              }}
            >
              {footer}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // -----------------------------
  // RENDER
  // -----------------------------
  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
        paddingBottom: 110,
      }}
    >
      <style>{globalFixesCSS}</style>

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
          <div style={{ opacity: 0.8 }}>No tasks yet. Tap + to create one.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeTasks.map((t) => {
              const { bg, text } = TASK_COLORS[colorIndexFromId(t.id)];
              const textIsBlack = text === "#000";

              const icon = pickIconKind(t.title);
              const p = progressByTask[t.id] ?? { done: 0, target: 1, ratio: 0 };

              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  className="dht-anim"
                  onClick={() => openEdit(t)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") openEdit(t);
                  }}
                  style={{
                    width: "100%",
                    borderRadius: 20,
                    background: bg,
                    color: text,
                    position: "relative",
                    overflow: "hidden",
                    padding: "12px 12px 13px",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.45)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        flex: "0 0 auto",
                        width: 34,
                        height: 34,
                        borderRadius: 14,
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
                          fontSize: 16,
                          lineHeight: 1.1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={t.title}
                      >
                        {t.title}
                      </div>

                      {/* Progress count (small) */}
                      <div style={{ marginTop: 6, opacity: 0.92, fontSize: 12, fontWeight: 900 }}>
                        {p.done}/{p.target}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEdit(t);
                      }}
                      disabled={busy}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 14,
                        border: textIsBlack ? "1px solid rgba(0,0,0,0.22)" : "1px solid rgba(255,255,255,0.26)",
                        background: textIsBlack ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.16)",
                        color: text,
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.65 : 1,
                      }}
                      title="Edit task"
                    >
                      Edit
                    </button>
                  </div>

                  {/* Progress bar (replaces bell/everyday/fluff line) */}
                  <ProgressBar ratio={p.ratio} textColor={text} bgIsDark={!textIsBlack} />
                </div>
              );
            })}
          </div>
        )}

        {!loading && archivedTasks.length > 0 ? (
          <div style={{ marginTop: 18 }}>
            <div style={{ fontWeight: 900, opacity: 0.9, marginBottom: 10 }}>Archived</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {archivedTasks.map((t) => {
                const p = progressByTask[t.id] ?? { done: 0, target: 1, ratio: 0 };
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => openEdit(t)}
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
                    <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
                      Progress: {p.done}/{p.target} ({Math.round(clamp01(p.ratio) * 100)}%)
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* ✅ Plus button now routes to your create page (no create logic lives here anymore) */}
      <BigPlusButton onClick={() => router.push("/tasks/create")} />

      {/* EDIT OVERLAY (kept) */}
      <OverlayShell
        open={editOpen}
        title="Edit task"
        onClose={closeEdit}
        footer={
          editTask ? (
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => toggleArchive(editTask)}
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
                  {editTask.archived ? "Unarchive" : "Archive"}
                </button>

                <button
                  type="button"
                  disabled={busy}
                  onClick={() => deleteTask(editTask)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255, 99, 99, 0.65)",
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 900,
                    cursor: busy ? "not-allowed" : "pointer",
                    opacity: busy ? 0.6 : 1,
                  }}
                >
                  Delete
                </button>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => saveEdit(editTask)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${theme.accent.primary}`,
                  background: theme.accent.primary,
                  color: "#000",
                  fontWeight: 900,
                  cursor: busy ? "not-allowed" : "pointer",
                  opacity: busy ? 0.65 : 1,
                }}
              >
                Save
              </button>
            </div>
          ) : null
        }
      >
        {!editTask ? (
          <div style={{ opacity: 0.8 }}>No task selected.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Title</div>
              <input
                value={editTask.title}
                disabled={busy}
                onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
                style={baseField}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Type</div>
                <select
                  value={editTask.type}
                  disabled={busy}
                  onChange={(e) => {
                    const nextType = e.target.value as TaskType;
                    setEditTask({
                      ...editTask,
                      type: nextType,
                      freq_times: nextType === "habit" ? editTask.freq_times ?? 1 : null,
                      freq_per: nextType === "habit" ? editTask.freq_per ?? "week" : null,
                    });
                  }}
                  style={cleanSelect}
                >
                  <option value="habit">Habit</option>
                  <option value="single">Single</option>
                </select>
              </div>

              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Weekly skips allowed</div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={editWeeklySkipsStr}
                  disabled={busy}
                  onChange={(e) => onNumberFieldChange(setEditWeeklySkipsStr, e.target.value)}
                  style={cleanNumber}
                />
              </div>
            </div>

            {editTask.type === "habit" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Times</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editFreqTimesStr}
                    disabled={busy}
                    onChange={(e) => onNumberFieldChange(setEditFreqTimesStr, e.target.value)}
                    style={cleanNumber}
                  />
                </div>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Per</div>
                  <select
                    value={editTask.freq_per ?? "week"}
                    disabled={busy}
                    onChange={(e) => setEditTask({ ...editTask, freq_per: e.target.value as FrequencyUnit })}
                    style={cleanSelect}
                  >
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </div>
              </div>
            ) : null}

            <div style={{ height: 6 }} />
            <ReminderEditor drafts={editReminders} setDrafts={setEditReminders} />
          </div>
        )}
      </OverlayShell>
    </main>
  );
}
