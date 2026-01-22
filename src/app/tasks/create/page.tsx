"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

  scheduled_days: number[] | null; // null => every day
  weekly_skips_allowed: number;

  is_shared?: boolean;
  assigned_to?: string | null;
};

type Cadence = "daily" | "weekly";

type ReminderDraft = {
  enabled: boolean;
  timezone: string; // tz
  time_of_day: string; // "HH:MM"
  cadence: Cadence; // daily or weekly
  days_of_week: number[]; // weekly: enforce exactly ONE day (0..6)
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

function parseBoundedInt(raw: string, opts: { min: number; max: number; fallback: number }) {
  const s = raw.trim();
  if (s === "") return opts.fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return opts.fallback;
  return Math.max(opts.min, Math.min(opts.max, Math.floor(n)));
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

const globalFixesCSS = `
input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type="number"] { -moz-appearance: textfield; }

@media (prefers-reduced-motion: reduce) {
  .dht-anim { transition: none !important; animation: none !important; }
}
`;

/* ------------------ tiny UI helpers ------------------ */

function Chip({ label, active, onClick }: { label: string; active?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? theme.accent.primary : "var(--border)"}`,
        background: active ? "rgba(255,255,255,0.05)" : "transparent",
        color: "var(--text)",
        fontWeight: 900,
        cursor: "pointer",
        opacity: active ? 1 : 0.82,
      }}
    >
      {label}
    </button>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: `1px solid ${theme.accent.primary}`,
        background: theme.accent.primary,
        color: "#000",
        fontWeight: 950,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SoftButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid var(--border)",
        background: "rgba(255,255,255,0.03)",
        color: "var(--text)",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function DangerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid rgba(255, 99, 99, 0.75)",
        background: "rgba(255, 99, 99, 0.12)",
        color: "var(--text)",
        fontWeight: 950,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------ main page ------------------ */

function CreateOrEditTaskInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const editId = searchParams.get("id"); // /tasks/create?id=...
  const isEdit = !!editId;

  const [userId, setUserId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // fields
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [freqTimesStr, setFreqTimesStr] = useState<string>("1");
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowedStr, setWeeklySkipsAllowedStr] = useState<string>("0");

  // reminders (still “create only” baseline; we keep it in edit too as draft you can re-add)
  const [draftReminders, setDraftReminders] = useState<ReminderDraft[]>([]);
  const [activeSection, setActiveSection] = useState<"basics" | "schedule" | "reminders" | "danger">("basics");

  const titleRef = useRef<HTMLInputElement | null>(null);

  const baseField: React.CSSProperties = {
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.02)",
    color: "var(--text)",
    outline: "none",
    width: "100%",
    fontWeight: 700,
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

  // auth
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) setStatus(error.message);
      const u = data.session?.user ?? null;
      setUserId(u?.id ?? null);

      setTimeout(() => titleRef.current?.focus(), 50);
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

  // load task on edit
  useEffect(() => {
    if (!isEdit) return;
    if (!userId) return;
    if (!editId) return;

    let alive = true;

    (async () => {
      setBusy(true);
      setStatus(null);
      try {
        const { data, error } = await supabase
          .from("tasks")
          .select("*")
          .eq("id", editId)
          .eq("user_id", userId)
          .single();

        if (error) throw error;
        if (!alive) return;

        const t = data as TaskRow;

        setTitle(t.title ?? "");
        setType((t.type as TaskType) ?? "habit");
        setFreqTimesStr(String(t.freq_times ?? 1));
        setFreqPer((t.freq_per as FrequencyUnit) ?? "week");
        setScheduledDays(t.scheduled_days ?? null);
        setWeeklySkipsAllowedStr(String(t.weekly_skips_allowed ?? 0));

        // baseline: reminders not loaded (by request earlier)
        setDraftReminders([]);
      } catch (e: any) {
        if (!alive) return;
        setStatus(e?.message ?? "Failed to load task for editing.");
      } finally {
        if (alive) setBusy(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [isEdit, editId, userId]);

  // derived
  const times = useMemo(() => parseBoundedInt(freqTimesStr, { min: 1, max: 365, fallback: 1 }), [freqTimesStr]);
  const skips = useMemo(() => parseBoundedInt(weeklySkipsAllowedStr, { min: 0, max: 7, fallback: 0 }), [weeklySkipsAllowedStr]);

  const scheduleSummary = useMemo(() => {
    if (type === "single") return "One-time task";
    return `${times} / ${freqPer} • ${fmtScheduledDays(scheduledDays)} • skips: ${skips}`;
  }, [type, times, freqPer, scheduledDays, skips]);

  const readyToSave = useMemo(() => {
    if (!title.trim()) return false;
    if (type === "habit") return times >= 1;
    return true;
  }, [title, type, times]);

  // helpers
  function toggleDay(day: number) {
    const current = scheduledDays;
    const base = current ?? [0, 1, 2, 3, 4, 5, 6];
    const set = new Set(base);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    const next = Array.from(set).sort((a, b) => a - b);
    if (next.length === 7) setScheduledDays(null);
    else setScheduledDays(next);
  }

  function normalizeDraft(d: ReminderDraft): ReminderDraft {
    const tz = (d.timezone || guessTimeZone()).trim() || guessTimeZone();
    const time = isTimeStringValidHHMM(d.time_of_day) ? d.time_of_day : "09:00";
    if (d.cadence === "daily") return { ...d, timezone: tz, time_of_day: time, days_of_week: [1] };
    const oneDay = d.days_of_week?.length ? d.days_of_week[0] : 1;
    const clamped = Math.max(0, Math.min(6, oneDay));
    return { ...d, timezone: tz, time_of_day: time, days_of_week: [clamped] };
  }

  function describeReminder(d: ReminderDraft) {
    const nd = normalizeDraft(d);
    const time = nd.time_of_day;
    const tz = nd.timezone;
    if (nd.cadence === "daily") return `Daily at ${time} (${tz})`;
    const day = nd.days_of_week[0];
    const label = DOW.find((x) => x.n === day)?.label ?? "?";
    return `Weekly on ${label} at ${time} (${tz})`;
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

  // Reminder Editor (more “card-like”)
  function ReminderEditor({
    drafts,
    setDrafts,
  }: {
    drafts: ReminderDraft[];
    setDrafts: (v: ReminderDraft[]) => void;
  }) {
    const hasOne = drafts.length >= 1;

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ fontWeight: 950, fontSize: 16 }}>Reminder</div>
          <SoftButton
            disabled={busy || hasOne}
            onClick={() => setDrafts([defaultReminderDraft()])}
          >
            + Add reminder
          </SoftButton>
        </div>

        <div style={{ fontSize: 13, opacity: 0.78 }}>
          Baseline: one reminder per task. (We can expand later.)
        </div>

        {!hasOne ? (
          <div
            style={{
              border: "1px dashed var(--border)",
              borderRadius: 16,
              padding: 14,
              opacity: 0.85,
            }}
          >
            No reminder set.
          </div>
        ) : null}

        {drafts.map((d0, idx) => {
          const d = normalizeDraft(d0);

          return (
            <div
              key={`rem-${idx}`}
              style={{
                border: "1px solid var(--border)",
                borderRadius: 16,
                padding: 14,
                background: "rgba(255,255,255,0.02)",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 950 }}>{describeReminder(d)}</div>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 900 }}>
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
                    {d.enabled ? "Enabled" : "Disabled"}
                  </label>
                  <DangerButton disabled={busy} onClick={() => setDrafts([])}>
                    Remove
                  </DangerButton>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Cadence</div>
                  <select
                    value={d.cadence}
                    disabled={busy}
                    onChange={(e) => {
                      const nextCadence = e.target.value as Cadence;
                      const next = drafts.slice();
                      const patched: ReminderDraft = { ...d, cadence: nextCadence };
                      if (nextCadence === "weekly") patched.days_of_week = patched.days_of_week.length ? [patched.days_of_week[0]] : [1];
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
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Time</div>
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
                </div>

                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Timezone</div>
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
                    Keep as your device timezone unless you have a reason.
                  </div>
                </div>

                {d.cadence === "weekly" ? (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Day of week</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {DOW.map((x) => {
                        const selected = d.days_of_week.length ? d.days_of_week[0] === x.n : false;
                        return (
                          <Chip
                            key={x.n}
                            label={x.label}
                            active={selected}
                            onClick={() => {
                              const next = drafts.slice();
                              next[idx] = { ...d, days_of_week: [x.n] };
                              setDrafts(next);
                            }}
                          />
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

  // CRUD
  async function saveTask() {
    if (!userId) {
      setStatus("You must be logged in.");
      return;
    }
    if (busy) return;

    const tTitle = title.trim();
    if (!tTitle) {
      setStatus("Please enter a title.");
      setActiveSection("basics");
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const payload: Partial<TaskRow> = {
        title: tTitle,
        type,
        freq_times: type === "habit" ? times : null,
        freq_per: type === "habit" ? freqPer : null,
        scheduled_days: scheduledDays,
        weekly_skips_allowed: skips,
      };

      if (!isEdit) {
        const { data: inserted, error } = await supabase
          .from("tasks")
          .insert({ ...payload, user_id: userId, archived: false })
          .select("*")
          .single();
        if (error) throw error;

        const newTask = inserted as TaskRow;

        const draft = draftReminders[0] ? normalizeDraft(draftReminders[0]) : null;
        if (draft) {
          const fields = draftToDbFields(newTask.id, draft);
          const { error: rErr } = await supabase.from("reminders").insert(fields);
          if (rErr) throw rErr;
        }
      } else {
        if (!editId) throw new Error("Missing task id for edit.");
        const { error } = await supabase.from("tasks").update(payload).eq("id", editId).eq("user_id", userId);
        if (error) throw error;
      }

      router.push("/tasks");
      router.refresh();
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to save task.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteTask() {
    if (!isEdit || !editId) return;
    if (!userId) return;
    if (busy) return;

    const ok = window.confirm("Delete this task permanently? This cannot be undone.");
    if (!ok) return;

    setBusy(true);
    setStatus(null);

    try {
      // Optional: clean reminders first (avoid FK issues if you have them)
      await supabase.from("reminders").delete().eq("task_id", editId).eq("user_id", userId);
      // Optional: clean completions too
      await supabase.from("completions").delete().eq("task_id", editId).eq("user_id", userId);

      const { error } = await supabase.from("tasks").delete().eq("id", editId).eq("user_id", userId);
      if (error) throw error;

      router.push("/tasks");
      router.refresh();
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to delete task.");
    } finally {
      setBusy(false);
    }
  }

  const pageTitle = isEdit ? "Edit task" : "New task";
  const primaryText = isEdit ? "Save changes" : "Create task";

  // “fun” preview card
  const previewAccent = useMemo(() => {
    const t = title.trim().toLowerCase();
    if (t.includes("water") || t.includes("hydrate")) return "#06B6D4";
    if (t.includes("gym") || t.includes("lift") || t.includes("bench") || t.includes("squat")) return "#A855F7";
    if (t.includes("walk") || t.includes("run") || t.includes("steps")) return "#22C55E";
    if (t.includes("read") || t.includes("study")) return "#3B82F6";
    return theme.accent.primary;
  }, [title]);

  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 20,
        paddingBottom: 110,
      }}
    >
      <style>{globalFixesCSS}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 34, fontWeight: 950 }}>{pageTitle}</h1>
              <span style={{ opacity: 0.72, fontWeight: 900 }}>
                {isEdit ? "Update details + schedule" : "Fast, clean setup"}
              </span>
            </div>
            <div style={{ height: 8 }} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip label="Basics" active={activeSection === "basics"} onClick={() => setActiveSection("basics")} />
              <Chip label="Schedule" active={activeSection === "schedule"} onClick={() => setActiveSection("schedule")} />
              <Chip label="Reminder" active={activeSection === "reminders"} onClick={() => setActiveSection("reminders")} />
              {isEdit ? (
                <Chip label="Danger zone" active={activeSection === "danger"} onClick={() => setActiveSection("danger")} />
              ) : null}
            </div>
          </div>

          <Link
            href="/tasks"
            style={{
              display: "inline-block",
              padding: "10px 12px",
              borderRadius: 14,
              border: "1px solid var(--border)",
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 900,
              opacity: 0.9,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            ← Back to Tasks
          </Link>
        </div>

        {status ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              border: "1px solid var(--border)",
              borderRadius: 16,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            {status}
          </div>
        ) : null}

        <div style={{ height: 14 }} />

        {/* Layout */}
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 14 }}>
          {/* LEFT: forms */}
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 20,
              padding: 16,
              background: "rgba(255,255,255,0.02)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
            }}
          >
            {activeSection === "basics" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontWeight: 950, fontSize: 16 }}>Basics</div>

                <div>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Title</div>
                  <input
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Drink water"
                    style={{ ...baseField, fontSize: 16 }}
                    disabled={busy}
                  />
                  <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>
                    Keep it short. This is what you’ll see on your home + tasks list.
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Type</div>
                    <select
                      value={type}
                      onChange={(e) => setType(e.target.value as TaskType)}
                      style={cleanSelect}
                      disabled={busy}
                    >
                      <option value="habit">Habit (recurring)</option>
                      <option value="single">Single (one-time)</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Quick template</div>
                    <select
                      value=""
                      onChange={(e) => {
                        const v = e.target.value;
                        if (!v) return;

                        // baseline presets (feel free to expand)
                        if (v === "water") {
                          setTitle((prev) => (prev.trim() ? prev : "Drink water"));
                          setType("habit");
                          setFreqTimesStr("8");
                          setFreqPer("day");
                          setScheduledDays(null);
                          setWeeklySkipsAllowedStr("0");
                        }
                        if (v === "steps") {
                          setTitle((prev) => (prev.trim() ? prev : "10k steps"));
                          setType("habit");
                          setFreqTimesStr("1");
                          setFreqPer("day");
                          setScheduledDays(null);
                          setWeeklySkipsAllowedStr("1");
                        }
                        if (v === "gym") {
                          setTitle((prev) => (prev.trim() ? prev : "Gym"));
                          setType("habit");
                          setFreqTimesStr("4");
                          setFreqPer("week");
                          setScheduledDays([1, 2, 4, 6]);
                          setWeeklySkipsAllowedStr("1");
                        }

                        // reset dropdown
                        setTimeout(() => {
                          (e.target as HTMLSelectElement).value = "";
                        }, 0);
                      }}
                      style={cleanSelect}
                      disabled={busy}
                    >
                      <option value="">Pick…</option>
                      <option value="water">Hydration</option>
                      <option value="steps">Steps</option>
                      <option value="gym">Gym</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <SoftButton
                    disabled={busy}
                    onClick={() => setActiveSection("schedule")}
                  >
                    Next: Schedule →
                  </SoftButton>

                  <PrimaryButton
                    disabled={busy || !readyToSave}
                    onClick={saveTask}
                  >
                    {primaryText}
                  </PrimaryButton>
                </div>
              </div>
            ) : null}

            {activeSection === "schedule" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950, fontSize: 16 }}>Schedule</div>
                  <div style={{ opacity: 0.75, fontWeight: 900 }}>{type === "habit" ? "How often?" : "One-time task"}</div>
                </div>

                {type === "habit" ? (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <div>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>Times</div>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={freqTimesStr}
                        onChange={(e) => onNumberFieldChange(setFreqTimesStr, e.target.value)}
                        style={baseField}
                        disabled={busy}
                        placeholder="1"
                      />
                    </div>
                    <div>
                      <div style={{ fontWeight: 900, marginBottom: 8 }}>Per</div>
                      <select
                        value={freqPer}
                        onChange={(e) => setFreqPer(e.target.value as FrequencyUnit)}
                        style={cleanSelect}
                        disabled={busy}
                      >
                        <option value="day">Day</option>
                        <option value="week">Week</option>
                        <option value="month">Month</option>
                        <option value="year">Year</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div style={{ opacity: 0.8 }}>
                    Single tasks don’t need frequency. You’ll just complete it once.
                  </div>
                )}

                <div>
                  <div style={{ fontWeight: 900, marginBottom: 8 }}>Scheduled days</div>
                  <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 10 }}>
                    Current: <b>{fmtScheduledDays(scheduledDays)}</b>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {DOW.map((x) => {
                      const active = scheduledDays == null ? true : scheduledDays.includes(x.n);
                      return (
                        <Chip
                          key={x.n}
                          label={x.label}
                          active={active}
                          onClick={() => toggleDay(x.n)}
                        />
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Weekly skips allowed</div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={weeklySkipsAllowedStr}
                      onChange={(e) => onNumberFieldChange(setWeeklySkipsAllowedStr, e.target.value)}
                      style={baseField}
                      disabled={busy}
                      placeholder="0"
                    />
                  </div>
                  <div style={{ fontSize: 13, opacity: 0.78, alignSelf: "end" }}>
                    Allows misses without “failing” the week.
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <SoftButton disabled={busy} onClick={() => setActiveSection("basics")}>
                    ← Back
                  </SoftButton>

                  <SoftButton disabled={busy} onClick={() => setActiveSection("reminders")}>
                    Next: Reminder →
                  </SoftButton>

                  <PrimaryButton disabled={busy || !readyToSave} onClick={saveTask}>
                    {primaryText}
                  </PrimaryButton>
                </div>
              </div>
            ) : null}

            {activeSection === "reminders" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                  <div style={{ fontWeight: 950, fontSize: 16 }}>Reminder</div>
                  <div style={{ opacity: 0.75, fontWeight: 900 }}>Optional</div>
                </div>

                <ReminderEditor drafts={draftReminders} setDrafts={setDraftReminders} />

                <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <SoftButton disabled={busy} onClick={() => setActiveSection("schedule")}>
                    ← Back
                  </SoftButton>

                  {isEdit ? (
                    <SoftButton disabled={busy} onClick={() => setActiveSection("danger")}>
                      Danger zone →
                    </SoftButton>
                  ) : null}

                  <PrimaryButton disabled={busy || !readyToSave} onClick={saveTask}>
                    {primaryText}
                  </PrimaryButton>
                </div>
              </div>
            ) : null}

            {activeSection === "danger" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontWeight: 950, fontSize: 16 }}>Danger zone</div>

                <div
                  style={{
                    border: "1px solid rgba(255, 99, 99, 0.35)",
                    borderRadius: 16,
                    padding: 14,
                    background: "rgba(255, 99, 99, 0.08)",
                  }}
                >
                  <div style={{ fontWeight: 950, marginBottom: 6 }}>Delete task</div>
                  <div style={{ opacity: 0.85, fontSize: 13, marginBottom: 12 }}>
                    This permanently deletes the task (and attempts to remove its reminders/completions).
                  </div>
                  <DangerButton disabled={busy} onClick={deleteTask}>
                    Delete task
                  </DangerButton>
                </div>

                <div style={{ display: "flex", gap: 10, justifyContent: "space-between", flexWrap: "wrap" }}>
                  <SoftButton disabled={busy} onClick={() => setActiveSection("basics")}>
                    ← Back
                  </SoftButton>

                  <PrimaryButton disabled={busy || !readyToSave} onClick={saveTask}>
                    {primaryText}
                  </PrimaryButton>
                </div>
              </div>
            ) : null}
          </div>

          {/* RIGHT: preview + quick summary */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: 16,
                background: "rgba(255,255,255,0.02)",
                boxShadow: "0 10px 24px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 10 }}>Preview</div>

              <div
                style={{
                  borderRadius: 18,
                  padding: 14,
                  background: previewAccent,
                  color: "#000",
                  boxShadow: "0 14px 28px rgba(0,0,0,0.35)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                  <div style={{ fontWeight: 950, fontSize: 18 }}>
                    {title.trim() ? title.trim() : "Untitled task"}
                  </div>
                  <div style={{ fontWeight: 900, opacity: 0.85 }}>
                    {type === "habit" ? "Habit" : "Single"}
                  </div>
                </div>

                <div style={{ height: 10 }} />

                <div
                  style={{
                    background: "rgba(0,0,0,0.18)",
                    borderRadius: 999,
                    height: 10,
                    overflow: "hidden",
                  }}
                >
                  <div style={{ height: "100%", width: "35%", background: "rgba(0,0,0,0.35)" }} />
                </div>

                <div style={{ height: 10 }} />
                <div style={{ fontSize: 13, fontWeight: 900, opacity: 0.9 }}>{scheduleSummary}</div>
              </div>

              <div style={{ height: 12 }} />

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <SoftButton disabled={busy} onClick={() => setActiveSection("basics")}>
                  Edit basics
                </SoftButton>
                <SoftButton disabled={busy} onClick={() => setActiveSection("schedule")}>
                  Edit schedule
                </SoftButton>
                <SoftButton disabled={busy} onClick={() => setActiveSection("reminders")}>
                  Edit reminder
                </SoftButton>
              </div>
            </div>

            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: 20,
                padding: 16,
                background: "rgba(255,255,255,0.02)",
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 8 }}>Quick checks</div>
              <div style={{ fontSize: 13, opacity: 0.86, display: "flex", flexDirection: "column", gap: 6 }}>
                <div>
                  • Title: <b>{title.trim() ? "✅" : "❌"}</b>
                </div>
                <div>
                  • Type: <b>{type === "habit" ? "Habit" : "Single"}</b>
                </div>
                <div>
                  • Reminder: <b>{draftReminders.length ? "✅" : "—"}</b>
                </div>
                <div style={{ marginTop: 10, opacity: 0.85 }}>
                  Tip: if you ever want an even “funnier” flow, we can make it a single scroll page with animated sections + a big sticky save button.
                </div>
              </div>

              <div style={{ height: 12 }} />
              <PrimaryButton disabled={busy || !readyToSave} onClick={saveTask}>
                {primaryText}
              </PrimaryButton>

              {isEdit ? (
                <div style={{ marginTop: 10 }}>
                  <DangerButton disabled={busy} onClick={() => setActiveSection("danger")}>
                    Delete…
                  </DangerButton>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function CreateOrEditTaskPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24 }}>Loading…</main>}>
      <CreateOrEditTaskInner />
    </Suspense>
  );
}
