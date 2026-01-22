"use client";

import React, { Suspense, useEffect, useRef, useState } from "react";
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

function StepChip({ label, active }: { label: string; active: boolean }) {
  return (
    <div
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? theme.accent.primary : "var(--border)"}`,
        background: active ? "rgba(255,255,255,0.04)" : "transparent",
        fontWeight: 900,
        fontSize: 12,
        opacity: active ? 1 : 0.8,
      }}
    >
      {label}
    </div>
  );
}

function CreateOrEditTaskInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const editId = searchParams.get("id"); // if present => edit mode
  const isEdit = !!editId;

  const [userId, setUserId] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Fields
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [freqTimesStr, setFreqTimesStr] = useState<string>("1");
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowedStr, setWeeklySkipsAllowedStr] = useState<string>("0");

  // Create reminders only (editing reminders later if you want)
  const [createReminders, setCreateReminders] = useState<ReminderDraft[]>([]);

  const [step, setStep] = useState<0 | 1 | 2>(0);

  const titleRef = useRef<HTMLInputElement | null>(null);

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

  // -----------------------------
  // Load task when editing
  // -----------------------------
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

        // for now, keep reminders empty on edit
        setCreateReminders([]);
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
    const timeHHMMSS = `${nd.time_of_day}:00`; // "HH:MM:SS"
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

  function canGoNextFromStep(s: 0 | 1 | 2) {
    if (s === 0) return title.trim().length >= 1;
    return true;
  }

  // -----------------------------
  // ReminderEditor (unchanged)
  // -----------------------------
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
            Note: Right now you can have <b>one</b> reminder per task (matches the backend assumption).
          </div>
        ) : (
          <div style={{ opacity: 0.75, fontSize: 13 }}>No reminders set. Add one if you want the app to notify you.</div>
        )}

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
          );
        })}
      </div>
    );
  }

  // -----------------------------
  // CREATE or UPDATE
  // -----------------------------
  async function saveTask() {
    if (!userId) {
      setStatus("You must be logged in.");
      return;
    }
    if (busy) return;

    const tTitle = title.trim();
    if (!tTitle) {
      setStatus("Please enter a title.");
      return;
    }

    const times = parseBoundedInt(freqTimesStr, { min: 1, max: 365, fallback: 1 });
    const skips = parseBoundedInt(weeklySkipsAllowedStr, { min: 0, max: 7, fallback: 0 });

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

        const draft = createReminders[0] ? normalizeDraft(createReminders[0]) : null;
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

  const pageTitle = isEdit ? "Edit task" : "Create task";
  const primaryText = isEdit ? "Save" : "Create";

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>{pageTitle}</h1>

          <Link
            href="/tasks"
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
            Back to Tasks
          </Link>
        </div>

        {status ? (
          <div style={{ marginTop: 12, padding: 12, border: "1px solid var(--border)", borderRadius: 14 }}>
            {status}
          </div>
        ) : null}

        <div style={{ height: 16 }} />

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <StepChip label="Title" active={step === 0} />
          <StepChip label="Schedule" active={step === 1} />
          <StepChip label="Reminders" active={step === 2} />
        </div>

        <div style={{ height: 14 }} />

        {step === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontWeight: 900 }}>Task title</div>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Drink water"
              style={baseField}
              disabled={busy}
            />

            <div style={{ fontWeight: 900 }}>Type</div>
            <select value={type} onChange={(e) => setType(e.target.value as TaskType)} style={cleanSelect} disabled={busy}>
              <option value="habit">Habit</option>
              <option value="single">Single</option>
            </select>
          </div>
        ) : null}

        {step === 1 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {type === "habit" ? (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Times</div>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={freqTimesStr}
                    onChange={(e) => onNumberFieldChange(setFreqTimesStr, e.target.value)}
                    style={cleanNumber}
                    disabled={busy}
                  />
                </div>
                <div>
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>Per</div>
                  <select value={freqPer} onChange={(e) => setFreqPer(e.target.value as FrequencyUnit)} style={cleanSelect} disabled={busy}>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </select>
                </div>
              </div>
            ) : (
              <div style={{ opacity: 0.8 }}>Single tasks don’t need a frequency.</div>
            )}

            <div style={{ fontWeight: 900 }}>Scheduled days</div>
            <div style={{ opacity: 0.8, fontSize: 13 }}>
              Current: <b>{fmtScheduledDays(scheduledDays)}</b>
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DOW.map((x) => {
                const active = scheduledDays == null ? true : scheduledDays.includes(x.n);
                return (
                  <button
                    key={x.n}
                    type="button"
                    disabled={busy}
                    onClick={() => toggleDay(x.n, scheduledDays, setScheduledDays)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 999,
                      border: `1px solid ${active ? theme.accent.primary : "var(--border)"}`,
                      background: active ? "rgba(255,255,255,0.04)" : "transparent",
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

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 6 }}>Weekly skips allowed</div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={weeklySkipsAllowedStr}
                  onChange={(e) => onNumberFieldChange(setWeeklySkipsAllowedStr, e.target.value)}
                  style={cleanNumber}
                  disabled={busy}
                />
              </div>
              <div style={{ opacity: 0.75, fontSize: 13, alignSelf: "end" }}>
                If you allow skips, missing a day won’t automatically “fail” the week.
              </div>
            </div>
          </div>
        ) : null}

        {step === 2 ? <ReminderEditor drafts={createReminders} setDrafts={setCreateReminders} /> : null}

        <div style={{ height: 18 }} />

        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <button
            type="button"
            disabled={busy || step === 0}
            onClick={() => setStep((s) => (s === 0 ? 0 : ((s - 1) as any)))}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text)",
              fontWeight: 900,
              cursor: busy || step === 0 ? "not-allowed" : "pointer",
              opacity: busy || step === 0 ? 0.6 : 1,
            }}
          >
            Back
          </button>

          {step < 2 ? (
            <button
              type="button"
              disabled={busy || !canGoNextFromStep(step)}
              onClick={() => setStep((s) => (s === 2 ? 2 : ((s + 1) as any)))}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                background: "rgba(255,255,255,0.04)",
                color: "var(--text)",
                fontWeight: 900,
                cursor: busy || !canGoNextFromStep(step) ? "not-allowed" : "pointer",
                opacity: busy || !canGoNextFromStep(step) ? 0.6 : 1,
              }}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={saveTask}
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
              {primaryText}
            </button>
          )}
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
