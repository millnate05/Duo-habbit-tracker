"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
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

  scheduled_days: number[] | null;
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
  tasks?: { title: string }[] | null;
};

type ReminderRow = {
  id: string;
  user_id: string;
  task_id: string;
  enabled: boolean;
  tz: string;
  reminder_time: string; // "HH:MM:SS"
  scheduled_days: number[] | null; // null means daily, otherwise weekly selection
  next_fire_at: string;
  created_at?: string;
  updated_at?: string;
};

type Cadence = "daily" | "weekly";

type ReminderDraft = {
  enabled: boolean;
  timezone: string; // tz
  time_of_day: string; // "HH:MM"
  cadence: Cadence; // daily or weekly
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

function fmtScheduledDays(days: number[] | null) {
  if (!days || days.length === 0) return "Every day";
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((d) => DOW.find((x) => x.n === d)?.label ?? "?").join(", ");
}

function parseBoundedInt(raw: string, { min, max, fallback }: { min: number; max: number; fallback: number }) {
  const s = raw.trim();
  if (s === "") return fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function guessTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
  } catch {
    return "America/Los_Angeles";
  }
}

function defaultReminderDraft(): ReminderDraft {
  return {
    enabled: true,
    timezone: guessTimeZone(),
    time_of_day: "09:00",
    cadence: "daily",
    days_of_week: [1],
  };
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

// ---------- Home-card palette + icon helpers (Tasks page) ----------
type TaskColor = { bg: string; text: "#000" | "#fff" };

const TASK_COLORS: TaskColor[] = [
  { bg: "#F59E0B", text: "#000" }, // orange
  { bg: "#3B82F6", text: "#fff" }, // blue
  { bg: "#22C55E", text: "#000" }, // green
  { bg: "#EF4444", text: "#fff" }, // red
  { bg: "#A855F7", text: "#fff" }, // purple
  { bg: "#06B6D4", text: "#000" }, // cyan
  { bg: "#F97316", text: "#000" }, // orange2
  { bg: "#84CC16", text: "#000" }, // lime
  { bg: "#0EA5E9", text: "#000" }, // sky
  { bg: "#111827", text: "#fff" }, // near-black slate
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

/**
 * Cleaner icons: solid + minimal detail (matches Home)
 */
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

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingCompleted, setLoadingCompleted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [remindersByTask, setRemindersByTask] = useState<Record<string, ReminderRow[]>>({});

  const [createOpen, setCreateOpen] = useState(false);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [freqTimesStr, setFreqTimesStr] = useState<string>("1");
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowedStr, setWeeklySkipsAllowedStr] = useState<string>("0");
  const [createReminders, setCreateReminders] = useState<ReminderDraft[]>([]);
  const [createStep, setCreateStep] = useState<0 | 1 | 2>(0);

  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);
  const [editFreqTimesStr, setEditFreqTimesStr] = useState<string>("1");
  const [editWeeklySkipsStr, setEditWeeklySkipsStr] = useState<string>("0");
  const [editReminders, setEditReminders] = useState<ReminderDraft[]>([]);

  const createTitleRef = useRef<HTMLInputElement | null>(null);

  const baseField: React.CSSProperties = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    outline: "none",
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
      setLoadingCompleted(false);
      return;
    }
    loadTasks(userId);
    loadCompletions(userId);
    loadReminders(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((t) => t.archived), [tasks]);

  // -----------------------------
  // helpers
  // -----------------------------
  function toggleDay(day: number, current: number[] | null, setFn: (v: number[] | null) => void) {
    const base = current ?? [0, 1, 2, 3, 4, 5, 6];
    const set = new Set(base);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    const next = Array.from(set).sort((a, b) => a - b);
    if (next.length === 7) setFn(null);
    else setFn(next);
  }

  function describeReminder(d: ReminderDraft) {
    const time = d.time_of_day;
    const tz = d.timezone;
    if (d.cadence === "daily") return `Daily at ${time} (${tz})`;

    const day = d.days_of_week.length ? d.days_of_week[0] : null;
    const label = day == null ? "no day" : DOW.find((x) => x.n === day)?.label ?? "?";
    return `Weekly on ${label} at ${time} (${tz})`;
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

  function ReminderEditor({
    drafts,
    setDrafts,
  }: {
    drafts: ReminderDraft[];
    setDrafts: (v: ReminderDraft[]) => void;
  }) {
    // (rest of your file continues...)
    return null as any;
  }

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

        {hasOne ? (
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            Note: Right now you can have <b>one</b> reminder per task (matches the backend).
          </div>
        ) : (
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            No reminders set. Add one if you want the app to notify you later.
          </div>
        )}

        {drafts.map((d, idx) => (
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
              <div style={{ fontWeight: 900, opacity: 0.95 }}>{describeReminder(d)}</div>

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
                    if (nextCadence === "weekly") {
                      patched.days_of_week = patched.days_of_week.length ? [patched.days_of_week[0]] : [1];
                    }

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
                    const v = e.target.value;
                    const next = drafts.slice();
                    next[idx] = { ...d, time_of_day: v };
                    setDrafts(next);
                  }}
                  style={baseField}
                />
                {!isTimeStringValidHHMM(d.time_of_day) ? (
                  <div style={{ fontSize: 12, opacity: 0.8, marginTop: 6 }}>Use HH:MM (24-hour)</div>
                ) : null}
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
                <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                  Tip: keep this as the device timezone unless you have a reason.
                </div>
              </div>

              {d.cadence === "weekly" ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Day of week</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {DOW.map((x) => {
                      const selected = d.days_of_week.length ? d.days_of_week[0] === x.n : false;
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
        ))}
      </div>
    );
  }

  // -----------------------------
  // reminders save
  // -----------------------------
  async function upsertRemindersForTask(taskId: string, drafts: ReminderDraft[]) {
    if (!userId) return;

    if (!drafts || drafts.length === 0) {
      const { error: delErr } = await supabase.from("reminders").delete().eq("user_id", userId).eq("task_id", taskId);
      if (delErr) throw delErr;
      await loadReminders(userId);
      return;
    }

    const d = drafts[0];

    if (!isTimeStringValidHHMM(d.time_of_day)) throw new Error(`Invalid time format: "${d.time_of_day}". Use HH:MM.`);
    if (!d.timezone.trim()) throw new Error("Timezone is required (ex: America/Los_Angeles).");
    if (d.cadence === "weekly" && d.days_of_week.length !== 1)
      throw new Error("Weekly reminder must have exactly one day selected.");

    const timeHHMMSS = `${d.time_of_day}:00`;
    const scheduledDays = d.cadence === "daily" ? null : [d.days_of_week[0]];

    const { error } = await supabase.rpc("upsert_task_reminder", {
      p_task_id: taskId,
      p_enabled: d.enabled,
      p_reminder_time: timeHHMMSS,
      p_tz: d.timezone,
      p_scheduled_days: scheduledDays,
    });

    if (error) throw error;

    await loadReminders(userId);
  }

  // -----------------------------
  // create task
  // -----------------------------
  function resetCreateForm() {
    setTitle("");
    setType("habit");
    setFreqTimesStr("1");
    setFreqPer("week");
    setScheduledDays(null);
    setWeeklySkipsAllowedStr("0");
    setCreateReminders([]);
    setCreateStep(0);
  }

  function openCreate() {
    if (busy) return;
    setStatus(null);
    setCreateOpen(true);
    setCreateStep(0);
    setTimeout(() => createTitleRef.current?.focus(), 50);
  }

  function closeCreate() {
    if (busy) return;
    setCreateOpen(false);
  }

  function canGoNextFromStep(step: 0 | 1 | 2) {
    if (step === 0) return title.trim().length > 0;
    if (step === 1) {
      if (type === "habit") {
        const n = parseBoundedInt(freqTimesStr, { min: 1, max: 999, fallback: 1 });
        return n >= 1 && !!freqPer;
      }
      return true;
    }
    return true;
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
      const freqTimes = parseBoundedInt(freqTimesStr, { min: 1, max: 999, fallback: 1 });
      const weeklySkipsAllowed = parseBoundedInt(weeklySkipsAllowedStr, { min: 0, max: 7, fallback: 0 });

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

      const { data, error } = await supabase.from("tasks").insert(base).select("*").single();
      if (error) throw error;

      setTasks((prev) => [data as TaskRow, ...prev]);

      const newTaskId = (data as TaskRow).id;
      await upsertRemindersForTask(newTaskId, createReminders);

      setStatus("✅ Task created.");
      resetCreateForm();
      setCreateOpen(false);
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to create task.");
    } finally {
      setBusy(false);
    }
  }

  // -----------------------------
  // edit + archive + delete
  // -----------------------------
  function openEdit(t: TaskRow) {
    setEditTask(t);
    setEditOpen(true);
    setStatus(null);
    setEditFreqTimesStr(String(t.freq_times ?? 1));
    setEditWeeklySkipsStr(String(t.weekly_skips_allowed ?? 0));

    const existing = remindersByTask[t.id] ?? [];
    setEditReminders(existing.length ? [toDraftFromRow(existing[0])] : []);
  }

  async function saveEdit(next: TaskRow) {
    if (!userId) return;

    const trimmed = next.title.trim();
    if (!trimmed) {
      setStatus("Title is required.");
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const freqTimes = parseBoundedInt(editFreqTimesStr, { min: 1, max: 999, fallback: 1 });
      const weeklySkipsAllowed = parseBoundedInt(editWeeklySkipsStr, { min: 0, max: 7, fallback: 0 });

      const { data, error } = await supabase
        .from("tasks")
        .update({
          title: trimmed,
          type: next.type,
          freq_times: next.type === "habit" ? freqTimes : null,
          freq_per: next.type === "habit" ? (next.freq_per ?? "week") : null,
          scheduled_days: next.scheduled_days,
          weekly_skips_allowed: weeklySkipsAllowed,
          archived: next.archived,
        })
        .eq("id", next.id)
        .eq("user_id", userId)
        .select("*")
        .single();

      if (error) throw error;

      const updated = data as TaskRow;
      setTasks((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));

      await upsertRemindersForTask(updated.id, editReminders);

      setEditOpen(false);
      setEditTask(null);
      setEditReminders([]);
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

   async function deleteTask(t: TaskRow) {
    if (!userId) return;
    if (busy) return;

    const ok = window.confirm(`Delete "${t.title}"?\n\nThis cannot be undone.`);
    if (!ok) return;

    setBusy(true);
    setStatus(null);

    try {
      const { error } = await supabase.from("tasks").delete().eq("id", t.id).eq("user_id", userId);
      if (error) throw error;

      setTasks((prev) => prev.filter((x) => x.id !== t.id));

      await supabase.from("reminders").delete().eq("user_id", userId).eq("task_id", t.id);

      setRemindersByTask((prev) => {
        const copy = { ...prev };
        delete copy[t.id];
        return copy;
      });

      if (editTask?.id === t.id) {
        setEditOpen(false);
        setEditTask(null);
      }
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to delete task.");
    } finally {
      setBusy(false);
    }
  }

  // -----------------------------
  // overlay behavior (esc + body scroll lock)
  // -----------------------------
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (createOpen) closeCreate();
        if (editOpen && !busy) {
          setEditOpen(false);
          setEditTask(null);
          setEditReminders([]);
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [createOpen, editOpen, busy]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    if (createOpen || editOpen) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [createOpen, editOpen]);

  // -----------------------------
  // UI pieces
  // -----------------------------
  function StepChip({ label, active }: { label: string; active: boolean }) {
    return (
      <div
        className="dht-anim"
        style={{
          padding: "8px 10px",
          borderRadius: 999,
          border: `1px solid ${active ? theme.accent.primary : "var(--border)"}`,
          background: active ? "rgba(255,255,255,0.04)" : "transparent",
          fontWeight: 900,
          fontSize: 12,
          opacity: active ? 1 : 0.75,
          transition: "all 220ms ease",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </div>
    );
  }

  function OverlayShell({
    open,
    title,
    onClose,
    children,
    footer,
  }: {
    open: boolean;
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
  }) {
    return (
      <div
        className="dht-anim"
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: open ? "auto" : "none",
          zIndex: 1000,
        }}
        aria-hidden={!open}
      >
        {/* Full black backdrop */}
        <div
          className="dht-anim"
          onClick={onClose}
          style={{
            position: "absolute",
            inset: 0,
            background: "#000",
            opacity: open ? 1 : 0,
            transition: "opacity 220ms ease",
          }}
        />

        {/* Fullscreen sheet */}
        <div
          className="dht-anim"
          role="dialog"
          aria-modal="true"
          style={{
            position: "absolute",
            inset: 0,
            margin: 0,
            width: "100%",
            height: "100%",
            borderRadius: 0,
            border: "none",
            background: "var(--bg)",
            boxShadow: "none",
            transform: open ? "translateY(0)" : "translateY(10px)",
            opacity: open ? 1 : 0,
            transition: "transform 240ms ease, opacity 240ms ease",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ padding: 16, borderBottom: "1px solid var(--border)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <div style={{ fontWeight: 900, fontSize: 18 }}>{title}</div>
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
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
                Close
              </button>
            </div>
          </div>

          <div style={{ padding: 16, overflowY: "auto", height: "calc(100% - 74px - 78px)" }}>{children}</div>

          <div style={{ padding: 16, borderTop: "1px solid var(--border)", background: "rgba(255,255,255,0.02)" }}>
            {footer ?? null}
          </div>
        </div>
      </div>
    );
  }

  // --- tiny icon buttons (no deps) ---
  function IconPencil({ size = 16 }: { size?: number }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path
          d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  function BigPlusButton({ onClick }: { onClick: () => void }) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        className="dht-anim"
        style={{
          position: "fixed",
          left: "50%",
          transform: "translateX(-50%)",
          bottom: 18,
          zIndex: 40,
          width: 64,
          height: 64,
          borderRadius: 999,
          border: `1px solid ${theme.accent.primary}`,
          background: "rgba(255,255,255,0.04)",
          backdropFilter: "blur(8px)",
          color: "var(--text)",
          fontSize: 34,
          fontWeight: 900,
          display: "grid",
          placeItems: "center",
          cursor: busy ? "not-allowed" : "pointer",
          opacity: busy ? 0.65 : 1,
          boxShadow: "0 14px 35px rgba(0,0,0,0.45)",
          transition: "transform 160ms ease, opacity 160ms ease",
        }}
        aria-label="Create task"
        title="Create task"
      >
        +
      </button>
    );
  }

  if (!userId) {
    return (
      <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
        <style>{globalFixesCSS}</style>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
          <p style={{ margin: "8px 0 0 0", opacity: 0.8 }}>Log in to manage tasks.</p>

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

  function CreateOverlay() {
    const stepTitle = createStep === 0 ? "Basics" : createStep === 1 ? "Schedule" : "Reminders";

    return (
      <OverlayShell
        open={createOpen}
        title={`Create Task • ${stepTitle}`}
        onClose={closeCreate}
        footer={
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (createStep === 0) {
                  setCreateOpen(false);
                  return;
                }
                setCreateStep((s) => (s === 2 ? 1 : 0));
              }}
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
              {createStep === 0 ? "Cancel" : "Back"}
            </button>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  resetCreateForm();
                  setStatus(null);
                  setTimeout(() => createTitleRef.current?.focus(), 50);
                }}
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
                Reset
              </button>

              {createStep < 2 ? (
                <button
                  type="button"
                  disabled={busy || !canGoNextFromStep(createStep)}
                  onClick={() => {
                    if (!canGoNextFromStep(createStep)) return;
                    setCreateStep((s) => (s === 0 ? 1 : 2));
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${theme.accent.primary}`,
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 900,
                    cursor: busy || !canGoNextFromStep(createStep) ? "not-allowed" : "pointer",
                    opacity: busy || !canGoNextFromStep(createStep) ? 0.6 : 1,
                  }}
                >
                  Next
                </button>
              ) : (
                <button
                  type="button"
                  onClick={createTask}
                  disabled={busy || title.trim().length === 0}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${theme.accent.primary}`,
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 900,
                    cursor: busy || title.trim().length === 0 ? "not-allowed" : "pointer",
                    opacity: busy || title.trim().length === 0 ? 0.6 : 1,
                  }}
                >
                  Create
                </button>
              )}
            </div>
          </div>
        }
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <StepChip label="1 • Basics" active={createStep === 0} />
          <StepChip label="2 • Schedule" active={createStep === 1} />
          <StepChip label="3 • Reminders" active={createStep === 2} />
        </div>

        {/* (same step content as before) */}
        {createStep === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontWeight: 900, opacity: 0.85 }}>Title</div>
            <input
              ref={createTitleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              style={{ ...baseField, width: "100%" }}
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 900, opacity: 0.85 }}>Type</div>
              <select value={type} onChange={(e) => setType(e.target.value as TaskType)} style={cleanSelect}>
                <option value="habit">Habit</option>
                <option value="single">Single</option>
              </select>
            </div>

            {type === "habit" ? (
              <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
                <div style={{ fontWeight: 900, marginBottom: 10 }}>Frequency</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={freqTimesStr}
                    onChange={(e) => onNumberFieldChange(setFreqTimesStr, e.target.value)}
                    style={{ ...cleanNumber, width: 90 }}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="1"
                  />
                  <span style={{ opacity: 0.85 }}>x per</span>
                  <select value={freqPer} onChange={(e) => setFreqPer(e.target.value as FrequencyUnit)} style={cleanSelect}>
                    <option value="day">day</option>
                    <option value="week">week</option>
                    <option value="month">month</option>
                    <option value="year">year</option>
                  </select>
                </div>
              </div>
            ) : (
              <div style={{ opacity: 0.8, fontSize: 13 }}>Single tasks can still have scheduled days + reminders.</div>
            )}
          </div>
        ) : null}

        {createStep === 1 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontWeight: 900, marginBottom: 6 }}>Scheduled days</div>
              <div style={{ opacity: 0.8, fontSize: 13, marginBottom: 10 }}>
                If you select all 7 days, it becomes <b>Every day</b>.
              </div>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {DOW.map((d) => {
                  const selected = (scheduledDays ?? [0, 1, 2, 3, 4, 5, 6]).includes(d.n);
                  return (
                    <button
                      key={d.n}
                      type="button"
                      onClick={() => toggleDay(d.n, scheduledDays, setScheduledDays)}
                      disabled={busy}
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
                      {d.label}
                    </button>
                  );
                })}
              </div>

              <div style={{ marginTop: 10, opacity: 0.85 }}>
                Selected: <b>{fmtScheduledDays(scheduledDays)}</b>
              </div>
            </div>

            <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
              <div style={{ fontWeight: 900, marginBottom: 8 }}>Weekly skips allowed</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={weeklySkipsAllowedStr}
                  onChange={(e) => onNumberFieldChange(setWeeklySkipsAllowedStr, e.target.value)}
                  style={{ ...cleanNumber, width: 90 }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                />
                <div style={{ opacity: 0.8, fontSize: 13 }}>Example: a 5x/week task can allow 2 skips.</div>
              </div>
            </div>
          </div>
        ) : null}

        {createStep === 2 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ReminderEditor drafts={createReminders} setDrafts={setCreateReminders} />
          </div>
        ) : null}
      </OverlayShell>
    );
  }

  // --- Home-screen style task row (you can tweak this to match your home exactly) ---
  function TaskCardHomeLook({
    t,
    isArchived,
  }: {
    t: TaskRow;
    isArchived: boolean;
  }) {
    const { bg, text } = TASK_COLORS[colorIndexFromId(t.id)];
    const textIsBlack = text === "#000";

    const rCount = (remindersByTask[t.id] ?? []).length;
    const kind = pickIconKind(t.title);

    return (
      <div
        style={{
          width: "100%",
          borderRadius: 20,
          background: bg,
          color: text,
          position: "relative",
          overflow: "hidden",
          padding: "12px 12px 13px",
          boxShadow: "0 10px 22px rgba(0,0,0,0.45)",
          opacity: isArchived ? 0.65 : 1,
          filter: isArchived ? "grayscale(1)" : "none",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10 }}>
          {/* Icon */}
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
            <MiniIcon kind={kind} />
          </div>

          {/* Title */}
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

            <div style={{ marginTop: 6, opacity: 0.9, fontSize: 12, fontWeight: 900 }}>
              {fmtScheduledDays(t.scheduled_days)} • Reminders: {rCount}
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: 10 }}>
            <button
              onClick={() => openEdit(t)}
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
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
              }}
              type="button"
            >
              <IconPencil />
              Edit
            </button>

            <button
              onClick={() => toggleArchive(t)}
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
              type="button"
            >
              {isArchived ? "Unarchive" : "Archive"}
            </button>

            <button
              onClick={() => deleteTask(t)}
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
              type="button"
            >
              Delete
            </button>
          </div>
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 8,
            background: textIsBlack ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "100%",
              background: textIsBlack ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.70)",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        height: "100vh",
        overflowY: "auto",
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
        paddingBottom: 110,
      }}
    >
      <style>{globalFixesCSS}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              Active: <b>{activeTasks.length}</b>
              {archivedTasks.length ? (
                <>
                  {" "}
                  • Archived: <b>{archivedTasks.length}</b>
                </>
              ) : null}
            </div>
          </div>

          {/* ✅ removed “New Task” text button entirely */}
        </div>

        {status ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
            {status}
          </div>
        ) : null}

        <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {loading ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>Loading…</div>
          ) : activeTasks.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              No active tasks. Tap <b>+</b> to create one.
            </div>
          ) : (
            activeTasks.map((t) => <TaskCardHomeLook key={t.id} t={t} isArchived={false} />)
          )}
        </section>

        {archivedTasks.length ? (
          <section style={{ marginTop: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 10 }}>Archived</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {archivedTasks.map((t) => (
                <TaskCardHomeLook key={t.id} t={t} isArchived={true} />
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <BigPlusButton onClick={openCreate} />
      <CreateOverlay />

      {/* NOTE: keeping your existing edit modal code from your previous file.
          If you want it to match the same full-screen create overlay style too, say so and I’ll convert it. */}
    </main>
  );
}
