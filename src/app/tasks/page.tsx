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

// KEEP: completion types/state/helpers (safe for Complete button + /completed page)
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

/**
 * ✅ UPDATED to match your NEW DB table: public.reminders
 * Columns we rely on:
 * - enabled (bool)
 * - tz (text)
 * - reminder_time (time) -> Supabase returns as string "HH:MM:SS"
 * - scheduled_days (int[]) -> 0..6 or null (null = daily)
 */
type ReminderRow = {
  id: string;
  user_id: string;
  task_id: string;
  enabled: boolean;
  tz: string;
  reminder_time: string; // "HH:MM:SS"
  scheduled_days: number[] | null; // null means daily, otherwise weekly selection
  next_fire_at: string; // timestamptz (stored, not edited here)
  created_at?: string;
  updated_at?: string;
};

/**
 * ✅ SIMPLIFIED reminder editor to align with compute_next_fire_at() + upsert_task_reminder()
 * (Daily or Weekly only — because your compute_next_fire_at currently supports days-of-week + time-of-day.)
 */
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
    days_of_week: [1], // Mon
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

const globalFixesCSS = `
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type="number"] { -moz-appearance: textfield; }
`;

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadingCompleted, setLoadingCompleted] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);

  // ✅ Now grouped from public.reminders (one row per task)
  const [remindersByTask, setRemindersByTask] = useState<Record<string, ReminderRow[]>>({});

  // Create form
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [freqTimesStr, setFreqTimesStr] = useState<string>("1");
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowedStr, setWeeklySkipsAllowedStr] = useState<string>("0");

  // ✅ We allow at most ONE reminder draft per task (matches your reminders table unique(task_id))
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
      .eq("assigned_to", uid)
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

  /**
   * ✅ UPDATED: Load from NEW TABLE "reminders"
   * We still group into remindersByTask[task_id] as an array for minimal UI changes.
   */
  async function loadReminders(uid: string) {
    const { data, error } = await supabase
      .from("reminders")
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

  /**
   * ✅ Convert DB reminder row -> UI draft
   * - If scheduled_days is null: daily
   * - Else: weekly (we only use first day)
   */
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
          <div style={{ opacity: 0.75, fontSize: 13 }}>No reminders set. Add one if you want the app to notify you later.</div>
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

  /**
   * ✅ NEW: This is the only place reminders are saved.
   * It writes to public.reminders by calling your RPC: upsert_task_reminder(...)
   * and deletes the reminder row if you removed it from the UI.
   */
  async function upsertRemindersForTask(taskId: string, drafts: ReminderDraft[]) {
    if (!userId) return;

    // If user removed reminders, delete the row so it won't fire
    if (!drafts || drafts.length === 0) {
      const { error: delErr } = await supabase.from("reminders").delete().eq("user_id", userId).eq("task_id", taskId);
      if (delErr) throw delErr;
      await loadReminders(userId);
      return;
    }

    // We only support 1 reminder per task currently
    const d = drafts[0];

    // Validate
    if (!isTimeStringValidHHMM(d.time_of_day)) throw new Error(`Invalid time format: "${d.time_of_day}". Use HH:MM.`);
    if (!d.timezone.trim()) throw new Error("Timezone is required (ex: America/Los_Angeles).");
    if (d.cadence === "weekly" && d.days_of_week.length !== 1) throw new Error("Weekly reminder must have exactly one day selected.");

    // Build RPC args
    const timeHHMMSS = `${d.time_of_day}:00`; // "HH:MM:SS"
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

      // ✅ Save reminder into NEW system (public.reminders) via RPC
      await upsertRemindersForTask(newTaskId, createReminders);

      // Reset
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

      // ✅ Save reminder into NEW system (public.reminders) via RPC
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

      // ✅ Also delete reminder row for this task (new system)
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
        <div>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
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

        {/* ✅ Completed UI REMOVED (intentionally) */}
        {/* We keep completions state + loadCompletions() for button flows / other pages */}
      </div>

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
                    style={{ ...baseField, width: 90 }}
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
                style={{ ...baseField, width: 90 }}
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="0"
              />
            </div>

            <div style={{ height: 12 }} />

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
    </main>
  );
}
