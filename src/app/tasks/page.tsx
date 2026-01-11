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

type Cadence = "daily" | "weekly" | "monthly" | "yearly";
type MonthlyMode = "day_of_month" | "nth_weekday";

type ReminderRow = {
  id: string;
  user_id: string;
  task_id: string;
  enabled: boolean;
  timezone: string;
  time_of_day: string; // "HH:MM"
  cadence: Cadence;

  days_of_week: number[] | null; // weekly: 0..6
  day_of_month: number | null; // monthly mode A
  week_of_month: number | null; // monthly mode B (1..4 or -1)
  weekday: number | null; // monthly mode B (0..6)

  month_of_year: number | null; // yearly
  day_of_year_month: number | null; // yearly

  // NOTE: we will NOT use start/end for daily reminders (we force null)
  start_date: string | null; // YYYY-MM-DD
  end_date: string | null; // YYYY-MM-DD

  created_at?: string;
};

type ReminderDraft = {
  id?: string; // if existing
  enabled: boolean;
  timezone: string;
  time_of_day: string;
  cadence: Cadence;

  // weekly (we'll enforce SINGLE day selection in UI)
  days_of_week: number[];

  // monthly
  monthlyMode: MonthlyMode;
  day_of_month: number; // 1..31
  week_of_month: number; // 1..4 or -1
  weekday: number; // 0..6

  // yearly
  month_of_year: number; // 1..12
  day_of_year_month: number; // 1..31

  // optional window (NOT shown/used for daily)
  start_date: string;
  end_date: string;
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

const MONTHS = [
  { n: 1, label: "Jan" },
  { n: 2, label: "Feb" },
  { n: 3, label: "Mar" },
  { n: 4, label: "Apr" },
  { n: 5, label: "May" },
  { n: 6, label: "Jun" },
  { n: 7, label: "Jul" },
  { n: 8, label: "Aug" },
  { n: 9, label: "Sep" },
  { n: 10, label: "Oct" },
  { n: 11, label: "Nov" },
  { n: 12, label: "Dec" },
];

const WEEK_OF_MONTH_OPTIONS = [
  { v: 1, label: "1st" },
  { v: 2, label: "2nd" },
  { v: 3, label: "3rd" },
  { v: 4, label: "4th" },
  { v: -1, label: "Last" },
];

function fmtScheduledDays(days: number[] | null) {
  if (!days || days.length === 0) return "Every day";
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((d) => DOW.find((x) => x.n === d)?.label ?? "?").join(", ");
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

    // weekly (single day in UI; default Monday)
    days_of_week: [1],

    monthlyMode: "day_of_month",
    day_of_month: 1,
    week_of_month: 1,
    weekday: 1, // Mon

    month_of_year: 1,
    day_of_year_month: 1,

    start_date: "",
    end_date: "",
  };
}

function toDraftFromRow(r: ReminderRow): ReminderDraft {
  const cadence = r.cadence;
  const days = Array.isArray(r.days_of_week) ? r.days_of_week : [];
  const monthlyMode: MonthlyMode =
    r.day_of_month != null ? "day_of_month" : "nth_weekday";

  return {
    id: r.id,
    enabled: !!r.enabled,
    timezone: r.timezone || guessTimeZone(),
    time_of_day: r.time_of_day || "09:00",
    cadence,

    // keep one if present; else default Mon
    days_of_week: days.length ? [days[0]] : [1],

    monthlyMode,
    day_of_month: r.day_of_month ?? 1,
    week_of_month: r.week_of_month ?? 1,
    weekday: r.weekday ?? 1,

    month_of_year: r.month_of_year ?? 1,
    day_of_year_month: r.day_of_year_month ?? 1,

    // daily should not have a window, but we store what exists for non-daily
    start_date: r.start_date ?? "",
    end_date: r.end_date ?? "",
  };
}

function toUpsertRow(
  taskId: string,
  userId: string,
  d: ReminderDraft
): Omit<ReminderRow, "id" | "created_at"> {
  const base: Omit<ReminderRow, "id" | "created_at"> = {
    user_id: userId,
    task_id: taskId,
    enabled: d.enabled,
    timezone: d.timezone,
    time_of_day: d.time_of_day,
    cadence: d.cadence,

    days_of_week: null,
    day_of_month: null,
    week_of_month: null,
    weekday: null,

    month_of_year: null,
    day_of_year_month: null,

    // IMPORTANT: daily reminders have NO start/end window
    start_date: d.cadence === "daily" ? null : d.start_date ? d.start_date : null,
    end_date: d.cadence === "daily" ? null : d.end_date ? d.end_date : null,
  };

  if (d.cadence === "weekly") {
    // single day expected; store array anyway for future flexibility
    base.days_of_week = d.days_of_week.length ? [d.days_of_week[0]] : [];
  }

  if (d.cadence === "monthly") {
    if (d.monthlyMode === "day_of_month") {
      base.day_of_month = d.day_of_month;
    } else {
      base.week_of_month = d.week_of_month;
      base.weekday = d.weekday;
    }
  }

  if (d.cadence === "yearly") {
    base.month_of_year = d.month_of_year;
    base.day_of_year_month = d.day_of_year_month;
  }

  return base;
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

const globalFixesCSS = `
/* Hide number input spinners (Chrome/Safari/Edge) */
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
/* Hide number input spinners (Firefox) */
input[type="number"] { -moz-appearance: textfield; }
`;

function daysInMonth(year: number, month0: number) {
  // month0: 0..11
  return new Date(year, month0 + 1, 0).getDate();
}

function firstDowOfMonth(year: number, month0: number) {
  return new Date(year, month0, 1).getDay(); // 0..6
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingCompleted, setLoadingCompleted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);

  // Reminders cache: taskId -> reminders
  const [remindersByTask, setRemindersByTask] = useState<Record<string, ReminderRow[]>>({});

  // Create form
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [freqTimesStr, setFreqTimesStr] = useState<string>("1");
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowedStr, setWeeklySkipsAllowedStr] = useState<string>("0");

  // Create reminders drafts
  const [createReminders, setCreateReminders] = useState<ReminderDraft[]>([]);

  // Edit modal
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
    .eq("assigned_to", uid) // ✅ only tasks assigned to me
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

  async function loadCompletions(uid: string) {
    setLoadingCompleted(true);

    const { data, error } = await supabase
      .from("completions")
      .select("id,user_id,task_id,proof_type,proof_note,photo_path,completed_at,tasks(title)")
      .eq("user_id", uid)
      .order("completed_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error(error);
      setStatus((prev) => prev ?? error.message);
      setCompletions([]);
      setLoadingCompleted(false);
      return;
    }

    setCompletions((data ?? []) as CompletionRow[]);
    setLoadingCompleted(false);
  }

  async function loadReminders(uid: string) {
    const { data, error } = await supabase
      .from("task_reminders")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: true });

    if (error) {
      console.error(error);
      setStatus((prev) => prev ?? error.message);
      setRemindersByTask({});
      return;
    }

    const grouped: Record<string, ReminderRow[]> = {};
    for (const r of (data ?? []) as ReminderRow[]) {
      grouped[r.task_id] = grouped[r.task_id] ? [...grouped[r.task_id], r] : [r];
    }
    setRemindersByTask(grouped);
  }

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

  function toggleDay(day: number, current: number[] | null, setFn: (v: number[] | null) => void) {
    const base = current ?? [0, 1, 2, 3, 4, 5, 6];
    const set = new Set(base);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    const next = Array.from(set).sort((a, b) => a - b);
    if (next.length === 7) setFn(null);
    else setFn(next);
  }

  function fmtDateTime(iso: string) {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  // ---------- Reminders UI helpers ----------
  function describeReminder(d: ReminderDraft) {
    const time = d.time_of_day;
    const tz = d.timezone;

    if (d.cadence === "daily") return `Daily at ${time} (${tz})`;

    if (d.cadence === "weekly") {
      const day = d.days_of_week.length ? d.days_of_week[0] : null;
      const label = day == null ? "no day" : DOW.find((x) => x.n === day)?.label ?? "?";
      return `Weekly on ${label} at ${time} (${tz})`;
    }

    if (d.cadence === "monthly") {
      if (d.monthlyMode === "day_of_month") {
        return `Monthly on day ${d.day_of_month} at ${time} (${tz})`;
      }
      const wom = WEEK_OF_MONTH_OPTIONS.find((x) => x.v === d.week_of_month)?.label ?? `${d.week_of_month}`;
      const wd = DOW.find((x) => x.n === d.weekday)?.label ?? "?";
      return `Monthly on ${wom} ${wd} at ${time} (${tz})`;
    }

    const m = MONTHS.find((x) => x.n === d.month_of_year)?.label ?? `${d.month_of_year}`;
    return `Yearly on ${m} ${d.day_of_year_month} at ${time} (${tz})`;
  }

  function DayOfMonthCalendarPicker({
    value,
    onChange,
    disabled,
  }: {
    value: number;
    onChange: (day: number) => void;
    disabled: boolean;
  }) {
    const [open, setOpen] = useState(false);
    const now = new Date();
    const [viewYear, setViewYear] = useState(now.getFullYear());
    const [viewMonth0, setViewMonth0] = useState(now.getMonth()); // 0..11

    const dim = daysInMonth(viewYear, viewMonth0);
    const firstDow = firstDowOfMonth(viewYear, viewMonth0); // 0..6
    const monthLabel = `${MONTHS[viewMonth0]?.label ?? ""} ${viewYear}`;

    function prevMonth() {
      const m = viewMonth0 - 1;
      if (m < 0) {
        setViewMonth0(11);
        setViewYear((y) => y - 1);
      } else {
        setViewMonth0(m);
      }
    }

    function nextMonth() {
      const m = viewMonth0 + 1;
      if (m > 11) {
        setViewMonth0(0);
        setViewYear((y) => y + 1);
      } else {
        setViewMonth0(m);
      }
    }

    // close if disabled flips on
    useEffect(() => {
      if (disabled) setOpen(false);
    }, [disabled]);

    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        <button
          type="button"
          disabled={disabled}
          onClick={() => setOpen((v) => !v)}
          style={{
            padding: "8px 10px",
            borderRadius: 12,
            border: `1px solid ${theme.accent.primary}`,
            background: "transparent",
            color: "var(--text)",
            fontWeight: 900,
            cursor: disabled ? "not-allowed" : "pointer",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          Pick day: {value}
        </button>

        {open ? (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              left: 0,
              zIndex: 50,
              width: 300,
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
              padding: 12,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
              <button
                type="button"
                disabled={disabled}
                onClick={prevMonth}
                style={{
                  padding: "6px 10px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  fontWeight: 900,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                ←
              </button>

              <div style={{ fontWeight: 900 }}>{monthLabel}</div>

              <button
                type="button"
                disabled={disabled}
                onClick={nextMonth}
                style={{
                  padding: "6px 10px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  fontWeight: 900,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                →
              </button>
            </div>

            <div style={{ height: 10 }} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, fontSize: 12, opacity: 0.85 }}>
              {DOW.map((d) => (
                <div key={d.n} style={{ textAlign: "center", fontWeight: 900 }}>
                  {d.label}
                </div>
              ))}
            </div>

            <div style={{ height: 8 }} />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}

              {Array.from({ length: dim }).map((_, i) => {
                const day = i + 1;
                const selected = day === value;
                return (
                  <button
                    key={day}
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      onChange(day);
                      setOpen(false);
                    }}
                    style={{
                      padding: "8px 0",
                      borderRadius: 12,
                      border: `1px solid ${selected ? theme.accent.primary : "var(--border)"}`,
                      background: selected ? "rgba(255,255,255,0.05)" : "transparent",
                      color: "var(--text)",
                      fontWeight: 900,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.6 : 1,
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div style={{ height: 10 }} />
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(false)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "transparent",
                  color: "var(--text)",
                  fontWeight: 900,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                Close
              </button>

              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  const today = new Date();
                  onChange(today.getDate());
                  setOpen(false);
                }}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: `1px solid ${theme.accent.primary}`,
                  background: "transparent",
                  color: "var(--text)",
                  fontWeight: 900,
                  cursor: disabled ? "not-allowed" : "pointer",
                  opacity: disabled ? 0.6 : 1,
                }}
              >
                Use today
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  function ReminderEditor({
    drafts,
    setDrafts,
  }: {
    drafts: ReminderDraft[];
    setDrafts: (v: ReminderDraft[]) => void;
  }) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontWeight: 900 }}>Reminders</div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setDrafts([...drafts, defaultReminderDraft()])}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: `1px solid ${theme.accent.primary}`,
              background: "transparent",
              color: "var(--text)",
              fontWeight: 900,
              cursor: busy ? "not-allowed" : "pointer",
              opacity: busy ? 0.6 : 1,
            }}
          >
            + Add reminder
          </button>
        </div>

        {drafts.length === 0 ? (
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            No reminders set. Add one if you want the app to notify you later.
          </div>
        ) : null}

        {drafts.map((d, idx) => (
          <div
            key={d.id ?? `new-${idx}`}
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
                  onClick={() => setDrafts(drafts.filter((_, i) => i !== idx))}
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

                    // When switching TO daily, remove any window (daily runs until deleted)
                    if (nextCadence === "daily") {
                      patched.start_date = "";
                      patched.end_date = "";
                    }

                    // Weekly: enforce a single selected day
                    if (nextCadence === "weekly") {
                      patched.days_of_week = patched.days_of_week.length ? [patched.days_of_week[0]] : [1];
                    }

                    // Monthly: keep defaults
                    if (nextCadence === "monthly" && !patched.monthlyMode) {
                      patched.monthlyMode = "day_of_month";
                    }

                    next[idx] = patched;
                    setDrafts(next);
                  }}
                  style={cleanSelect}
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
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

              {/* Weekly (single day selection) */}
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
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                    Weekly reminders pick <b>one</b> day. For “every day”, use <b>Daily</b>.
                  </div>
                </div>
              ) : null}

              {/* Monthly */}
              {d.cadence === "monthly" ? (
                <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontWeight: 900 }}>Monthly pattern</div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="radio"
                        name={`mmode-${idx}`}
                        checked={d.monthlyMode === "day_of_month"}
                        disabled={busy}
                        onChange={() => {
                          const next = drafts.slice();
                          next[idx] = { ...d, monthlyMode: "day_of_month" };
                          setDrafts(next);
                        }}
                      />
                      <span style={{ fontWeight: 900 }}>Day of month</span>
                    </label>

                    <label style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                      <input
                        type="radio"
                        name={`mmode-${idx}`}
                        checked={d.monthlyMode === "nth_weekday"}
                        disabled={busy}
                        onChange={() => {
                          const next = drafts.slice();
                          next[idx] = { ...d, monthlyMode: "nth_weekday" };
                          setDrafts(next);
                        }}
                      />
                      <span style={{ fontWeight: 900 }}>Nth weekday</span>
                    </label>
                  </div>

                  {d.monthlyMode === "day_of_month" ? (
                    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ fontWeight: 900, opacity: 0.9 }}>Pick day</div>

                      {/* MINI CALENDAR PICKER */}
                      <DayOfMonthCalendarPicker
                        value={d.day_of_month}
                        disabled={busy}
                        onChange={(day) => {
                          const next = drafts.slice();
                          next[idx] = { ...d, day_of_month: day };
                          setDrafts(next);
                        }}
                      />

                      <div style={{ fontSize: 12, opacity: 0.75 }}>
                        This stores the <b>day number</b> (1–31). If a month doesn’t have that day (ex: 31st),
                        your backend should decide how to handle it (usually “skip”).
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                      <div style={{ fontWeight: 900, opacity: 0.9 }}>Week</div>
                      <select
                        value={String(d.week_of_month)}
                        disabled={busy}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const next = drafts.slice();
                          next[idx] = { ...d, week_of_month: v };
                          setDrafts(next);
                        }}
                        style={cleanSelect}
                      >
                        {WEEK_OF_MONTH_OPTIONS.map((o) => (
                          <option key={o.v} value={String(o.v)}>
                            {o.label}
                          </option>
                        ))}
                      </select>

                      <div style={{ fontWeight: 900, opacity: 0.9 }}>Weekday</div>
                      <select
                        value={String(d.weekday)}
                        disabled={busy}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const next = drafts.slice();
                          next[idx] = { ...d, weekday: v };
                          setDrafts(next);
                        }}
                        style={cleanSelect}
                      >
                        {DOW.map((o) => (
                          <option key={o.n} value={String(o.n)}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              ) : null}

              {/* Yearly */}
              {d.cadence === "yearly" ? (
                <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                  <div style={{ fontWeight: 900, opacity: 0.9 }}>Month</div>
                  <select
                    value={String(d.month_of_year)}
                    disabled={busy}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      const next = drafts.slice();
                      next[idx] = { ...d, month_of_year: v };
                      setDrafts(next);
                    }}
                    style={cleanSelect}
                  >
                    {MONTHS.map((m) => (
                      <option key={m.n} value={String(m.n)}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  <div style={{ fontWeight: 900, opacity: 0.9 }}>Day</div>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={String(d.day_of_year_month)}
                    disabled={busy}
                    onChange={(e) => {
                      const n = parseBoundedInt(e.target.value, { min: 1, max: 31, fallback: 1 });
                      const next = drafts.slice();
                      next[idx] = { ...d, day_of_year_month: n };
                      setDrafts(next);
                    }}
                    style={{ ...cleanNumber, width: 90 }}
                  />
                </div>
              ) : null}

              {/* Optional window (NOT for daily) */}
              {d.cadence !== "daily" ? (
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Active window (optional)</div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ opacity: 0.85, fontWeight: 900 }}>Start</div>
                    <input
                      type="date"
                      value={d.start_date}
                      disabled={busy}
                      onChange={(e) => {
                        const next = drafts.slice();
                        next[idx] = { ...d, start_date: e.target.value };
                        setDrafts(next);
                      }}
                      style={baseField}
                    />

                    <div style={{ opacity: 0.85, fontWeight: 900 }}>End</div>
                    <input
                      type="date"
                      value={d.end_date}
                      disabled={busy}
                      onChange={(e) => {
                        const next = drafts.slice();
                        next[idx] = { ...d, end_date: e.target.value };
                        setDrafts(next);
                      }}
                      style={baseField}
                    />

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        const next = drafts.slice();
                        next[idx] = { ...d, start_date: "", end_date: "" };
                        setDrafts(next);
                      }}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      Clear window
                    </button>
                  </div>

                  <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>
                    If set, the reminder is only valid inside this date window.
                  </div>
                </div>
              ) : (
                <div style={{ gridColumn: "1 / -1", fontSize: 12, opacity: 0.75 }}>
                  Daily reminders run until you delete them (no start/end dates).
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ---------- DB operations for reminders ----------
  async function upsertRemindersForTask(taskId: string, drafts: ReminderDraft[]) {
    if (!userId) return;

    for (const d of drafts) {
      if (!isTimeStringValidHHMM(d.time_of_day)) {
        throw new Error(`Invalid time format: "${d.time_of_day}". Use HH:MM.`);
      }
      if (!d.timezone.trim()) {
        throw new Error("Timezone is required (ex: America/Los_Angeles).");
      }

      // Weekly: SINGLE day required now
      if (d.cadence === "weekly") {
        if (d.days_of_week.length !== 1) {
          throw new Error("Weekly reminder must have exactly one day selected.");
        }
      }

      if (d.cadence === "monthly" && d.monthlyMode === "day_of_month") {
        if (d.day_of_month < 1 || d.day_of_month > 31) throw new Error("Monthly day must be 1..31.");
      }
      if (d.cadence === "monthly" && d.monthlyMode === "nth_weekday") {
        if (![1, 2, 3, 4, -1].includes(d.week_of_month)) throw new Error("Week-of-month must be 1..4 or -1.");
        if (d.weekday < 0 || d.weekday > 6) throw new Error("Weekday must be 0..6.");
      }
      if (d.cadence === "yearly") {
        if (d.month_of_year < 1 || d.month_of_year > 12) throw new Error("Month must be 1..12.");
        if (d.day_of_year_month < 1 || d.day_of_year_month > 31) throw new Error("Day must be 1..31.");
      }
    }

    const { error: delErr } = await supabase
      .from("task_reminders")
      .delete()
      .eq("user_id", userId)
      .eq("task_id", taskId);

    if (delErr) throw delErr;

    if (drafts.length === 0) {
      await loadReminders(userId);
      return;
    }

    const payload = drafts.map((d) => toUpsertRow(taskId, userId, d));
    const { error: insErr } = await supabase.from("task_reminders").insert(payload);
    if (insErr) throw insErr;

    await loadReminders(userId);
  }

  // ---------- Create / Edit ----------
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
      if (createReminders.length > 0) {
        await upsertRemindersForTask(newTaskId, createReminders);
      }

      setTitle("");
      setType("habit");
      setFreqTimesStr("1");
      setFreqPer("week");
      setScheduledDays(null);
      setWeeklySkipsAllowedStr("0");
      setCreateReminders([]);
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
    setEditFreqTimesStr(String(t.freq_times ?? 1));
    setEditWeeklySkipsStr(String(t.weekly_skips_allowed ?? 0));

    const existing = remindersByTask[t.id] ?? [];
    setEditReminders(existing.map(toDraftFromRow));
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

  // ---------- Render ----------
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

  return (
    <main
      style={{
        height: "100vh",
        overflowY: "auto",
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
      }}
    >
      <style>{globalFixesCSS}</style>

      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          paddingBottom: 40,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Logged in as <b>{sessionEmail}</b>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
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
          </div>
        </div>

        {status ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
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

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ fontWeight: 900, opacity: 0.9 }}>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as TaskType)} style={cleanSelect}>
                <option value="habit">Habit</option>
                <option value="single">Single</option>
              </select>

              {type === "habit" ? (
                <>
                  <label style={{ fontWeight: 900, opacity: 0.9 }}>Frequency</label>
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
                </>
              ) : null}
            </div>

            {/* Scheduled days */}
            <div>
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

            {/* Weekly skips allowed */}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ fontWeight: 900 }}>Weekly skips allowed</div>
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

            {/* Reminders */}
            <div style={{ height: 6 }} />
            <ReminderEditor drafts={createReminders} setDrafts={setCreateReminders} />

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

        {/* Active */}
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
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              Loading…
            </div>
          ) : activeTasks.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              No active tasks.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeTasks.map((t) => {
                const rCount = (remindersByTask[t.id] ?? []).length;
                return (
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
                            Habit • <b>{t.freq_times ?? 1}x</b> per <b>{t.freq_per ?? "week"}</b>
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
                        <span>
                          {" "}
                          • Reminders: <b>{rCount}</b>
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

                      <button
                        type="button"
                        onClick={() => deleteTask(t)}
                        disabled={busy}
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
                  </div>
                );
              })}
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
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
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
                          Habit • <b>{t.freq_times ?? 1}x</b> per <b>{t.freq_per ?? "week"}</b>
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
                      <span>
                        {" "}
                        • Reminders: <b>{(remindersByTask[t.id] ?? []).length}</b>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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

                    <button
                      type="button"
                      onClick={() => deleteTask(t)}
                      disabled={busy}
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
                </div>
              ))}
            </div>
          )}
        </section>

        {/* COMPLETED */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 0,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: 16, borderBottom: "1px solid var(--border)", background: "rgba(255,255,255,0.03)" }}>
            <div style={{ fontSize: 20, fontWeight: 900 }}>Completed</div>
            <div style={{ marginTop: 6, opacity: 0.85 }}>
              Total: <b>{completions.length}</b>
            </div>
          </div>

          <div style={{ padding: 16 }}>
            {loadingCompleted ? (
              <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
                Loading…
              </div>
            ) : completions.length === 0 ? (
              <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
                No completed tasks yet.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {completions.map((c) => (
                  <div
                    key={c.id}
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
                      <div style={{ fontWeight: 900 }}>{c.tasks?.[0]?.title ?? "Task"}</div>
                      <div style={{ opacity: 0.85, marginTop: 6 }}>
                        <span>
                          Completed: <b>{fmtDateTime(c.completed_at)}</b>
                        </span>
                        <span>
                          {" "}
                          • Proof: <b>{c.proof_type}</b>
                        </span>
                        {c.proof_note ? (
                          <span>
                            {" "}
                            • Note: <b>{c.proof_note}</b>
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
              setEditReminders([]);
            }}
          >
            <div
              style={{
                width: "min(820px, 100%)",
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
                onChange={(e) => setEditTask({ ...editTask, title: e.target.value })}
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

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <label style={{ fontWeight: 900, opacity: 0.9 }}>Type</label>
                <select
                  value={editTask.type}
                  onChange={(e) => setEditTask({ ...editTask, type: e.target.value as TaskType })}
                  style={cleanSelect}
                >
                  <option value="habit">Habit</option>
                  <option value="single">Single</option>
                </select>

                {editTask.type === "habit" ? (
                  <>
                    <label style={{ fontWeight: 900, opacity: 0.9 }}>Frequency</label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={editFreqTimesStr}
                      onChange={(e) => onNumberFieldChange(setEditFreqTimesStr, e.target.value)}
                      style={{ ...cleanNumber, width: 90 }}
                      inputMode="numeric"
                      pattern="[0-9]*"
                      placeholder="1"
                    />
                    <span style={{ opacity: 0.85 }}>x per</span>
                    <select
                      value={(editTask.freq_per ?? "week") as FrequencyUnit}
                      onChange={(e) => setEditTask({ ...editTask, freq_per: e.target.value as FrequencyUnit })}
                      style={cleanSelect}
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
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Scheduled days</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {DOW.map((d) => {
                    const selected = (editTask.scheduled_days ?? [0, 1, 2, 3, 4, 5, 6]).includes(d.n);
                    return (
                      <button
                        key={d.n}
                        type="button"
                        onClick={() =>
                          toggleDay(d.n, editTask.scheduled_days, (v) => setEditTask({ ...editTask, scheduled_days: v }))
                        }
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
                  Selected: <b>{fmtScheduledDays(editTask.scheduled_days)}</b>
                </div>
              </div>

              <div style={{ height: 12 }} />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>Weekly skips allowed</div>
                <input
                  type="number"
                  min={0}
                  max={7}
                  value={editWeeklySkipsStr}
                  onChange={(e) => onNumberFieldChange(setEditWeeklySkipsStr, e.target.value)}
                  style={{ ...cleanNumber, width: 90 }}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="0"
                />
              </div>

              <div style={{ height: 12 }} />

              {/* Reminders */}
              <ReminderEditor drafts={editReminders} setDrafts={setEditReminders} />

              <div style={{ height: 14 }} />

              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => deleteTask(editTask)}
                  disabled={busy}
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

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => {
                      setEditOpen(false);
                      setEditTask(null);
                      setEditReminders([]);
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
          </div>
        )}
      </div>
    </main>
  );
}
