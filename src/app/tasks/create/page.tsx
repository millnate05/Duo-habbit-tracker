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
  assigned_to?: string | null; // DB is UUID; must be userId or null (NOT "me")
};

type Cadence = "daily" | "weekly";

type ReminderDraft = {
  enabled: boolean;
  timezone: string; // tz
  time_of_day: string; // "HH:MM"
  cadence: Cadence; // daily or weekly
  days_of_week: number[]; // weekly: enforce exactly ONE day (0..6)
};

const ORANGE = "#ff7a18"; // FORCE ORANGE (not theme-dependent)

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

/**
 * - Prevents iOS zoom: enforce 16px on inputs/selects/textarea
 * - Force orange CSS var
 */
const globalFixesCSS = `
:root { --dht-orange: ${ORANGE}; }
* { -webkit-text-size-adjust: 100%; }
input, select, textarea, button { font-size: 16px; }

input[type="number"]::-webkit-outer-spin-button,
input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
input[type="number"] { -moz-appearance: textfield; }

@media (prefers-reduced-motion: reduce) {
  .dht-anim { transition: none !important; animation: none !important; }
}
`;

/* -------------------- tiny inline icons (no library) -------------------- */

function Icon({
  children,
  size = 18,
  color,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: color ?? "var(--dht-orange)",
        flex: "0 0 auto",
      }}
    >
      {children}
    </span>
  );
}

function ITitle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 7h10M7 12h10M7 17h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IType() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 7h10v10H7z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M9 9h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function ICalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 3v3M17 3v3M4 8h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ISkips() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M8 7h8M8 12h8M8 17h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 14l2 2m0-2-2 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IShareMini() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M16 8a3 3 0 1 0-2.8-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M7 14a3 3 0 1 0 0 6a3 3 0 0 0 0-6Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M16.5 7.5 9.6 12.2M9.6 15.8l6.9 4.7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M19 18a3 3 0 1 0-1.2 2.4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/* -------------------- UI bits -------------------- */

function SectionHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            border: `1px solid rgba(255,255,255,0.12)`,
            background: `linear-gradient(180deg, rgba(255,122,24,0.14), rgba(255,255,255,0.03))`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 10px 22px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(0,0,0,0.25)`,
            flex: "0 0 auto",
          }}
        >
          {icon}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontWeight: 950, fontSize: 16, lineHeight: 1.1 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 13, opacity: 0.78 }}>{subtitle}</div> : null}
        </div>
      </div>

      {right ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div> : null}
    </div>
  );
}

function SoftButton({
  children,
  onClick,
  disabled,
  small,
  active,
  orangeBorder,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  small?: boolean;
  active?: boolean;
  orangeBorder?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        padding: small ? "8px 10px" : "12px 14px",
        borderRadius: 14,
        border: `1px solid ${active || orangeBorder ? "rgba(255,122,24,0.85)" : "var(--border)"}`,
        background: active ? "rgba(255,122,24,0.12)" : "rgba(255,255,255,0.03)",
        color: "var(--text)",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: small ? 13 : 14,
        lineHeight: 1,
        whiteSpace: "nowrap",
        boxShadow: active ? `0 0 0 3px rgba(255,122,24,0.10)` : "none",
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

function DayPill({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "rgba(255,122,24,0.90)" : "var(--border)"}`,
        background: active ? "rgba(255,122,24,0.12)" : "transparent",
        color: "var(--text)",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : active ? 1 : 0.82,
        boxShadow: active ? "0 0 0 3px rgba(255,122,24,0.08)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      style={{
        width: 54,
        height: 30,
        borderRadius: 999,
        border: `1px solid ${checked ? "rgba(255,122,24,0.55)" : "var(--border)"}`,
        background: checked ? "rgba(255,122,24,0.10)" : "rgba(255,255,255,0.03)",
        position: "relative",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        padding: 0,
        boxShadow: checked ? `0 0 0 3px rgba(255,122,24,0.08)` : "none",
        flex: "0 0 auto",
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 3,
          left: checked ? 27 : 3,
          width: 24,
          height: 24,
          borderRadius: 999,
          background: checked ? ORANGE : "rgba(255,255,255,0.35)",
          transition: "left 160ms ease",
          boxShadow: checked ? "0 8px 16px rgba(0,0,0,0.35)" : "none",
        }}
      />
    </button>
  );
}

/* -------------------- PAGE -------------------- */

function CreateOrEditTaskInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const editId = searchParams.get("id"); // /tasks/create?id=...
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

  const [draftReminders, setDraftReminders] = useState<ReminderDraft[]>([]);

  // THIS TOGGLE IS NOW A NAV SHORTCUT (not a DB field here)
  const [shareShortcutOn, setShareShortcutOn] = useState(false);

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
    fontSize: 16,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
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

  // load task on edit (and hide the share shortcut toggle in edit mode)
  useEffect(() => {
    if (!isEdit) return;
    setShareShortcutOn(false);
  }, [isEdit]);

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

  const times = useMemo(
    () => parseBoundedInt(freqTimesStr, { min: 1, max: 365, fallback: 1 }),
    [freqTimesStr]
  );
  const skips = useMemo(
    () => parseBoundedInt(weeklySkipsAllowedStr, { min: 0, max: 7, fallback: 0 }),
    [weeklySkipsAllowedStr]
  );

  const readyToSave = useMemo(() => {
    if (!title.trim()) return false;
    if (type === "habit") return times >= 1;
    return true;
  }, [title, type, times]);

  function toggleDay(day: number) {
    const base = scheduledDays ?? [0, 1, 2, 3, 4, 5, 6];
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
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon>
              <IBell />
            </Icon>
            <div style={{ fontWeight: 950, fontSize: 16 }}>Reminders</div>
          </div>

          <SoftButton disabled={busy || hasOne} onClick={() => setDrafts([defaultReminderDraft()])} small orangeBorder>
            + Add reminder
          </SoftButton>
        </div>

        {!hasOne ? (
          <div style={{ border: "1px dashed rgba(255,122,24,0.35)", borderRadius: 16, padding: 14, opacity: 0.95 }}>
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
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div style={{ fontWeight: 950, color: "var(--dht-orange)" }}>{describeReminder(d)}</div>
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
                  <SoftButton disabled={busy} onClick={() => setDrafts([])} small>
                    Remove
                  </SoftButton>
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
                </div>

                {d.cadence === "weekly" ? (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Day of week</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {DOW.map((x) => {
                        const selected = d.days_of_week.length ? d.days_of_week[0] === x.n : false;
                        return (
                          <DayPill
                            key={x.n}
                            label={x.label}
                            active={selected}
                            disabled={busy}
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

    setBusy(true);
    setStatus(null);

    try {
      // NOTE: This page is for personal tasks.
      // Shared tasks are created on the Shared Tasks page.
      const payload: Partial<TaskRow> = {
        title: tTitle,
        type,
        freq_times: type === "habit" ? times : null,
        freq_per: type === "habit" ? freqPer : null,
        scheduled_days: scheduledDays,
        weekly_skips_allowed: skips,
        is_shared: false,
        assigned_to: userId, // ✅ FIX: UUID of logged-in user (not "me")
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
      await supabase.from("reminders").delete().eq("task_id", editId).eq("user_id", userId);
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

  function onToggleShareShortcut(next: boolean) {
    setShareShortcutOn(next);

    if (next) {
      // CHANGE THIS PATH if your shared page route is different.
      router.push("/shared");
    }
  }

  const pageTitle = isEdit ? "Edit task" : "New task";
  const primaryText = isEdit ? "Save" : "Create";

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

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        {/* Top row */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <Link
            href="/tasks"
            style={{
              display: "inline-block",
              padding: "7px 9px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              color: "var(--text)",
              textDecoration: "none",
              fontWeight: 900,
              opacity: 0.95,
              background: "rgba(255,255,255,0.02)",
              fontSize: 12,
              lineHeight: 1,
              whiteSpace: "nowrap",
            }}
          >
            ← Tasks
          </Link>

          <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)", textAlign: "center" }}>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 950 }}>{pageTitle}</h1>
          </div>

          <div style={{ width: 64 }} />
        </div>

        {status ? (
          <div
            style={{
              marginTop: 14,
              padding: 12,
              border: "1px solid rgba(255,122,24,0.25)",
              borderRadius: 16,
              background: "rgba(255,255,255,0.02)",
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
            }}
          >
            {status}
          </div>
        ) : null}

        <div style={{ height: 14 }} />

        {/* Main card */}
        <div
          style={{
            border: "1px solid rgba(255,122,24,0.20)",
            borderRadius: 22,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.25), 0 0 0 4px rgba(255,122,24,0.06) inset",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {/* 1) Title + Share shortcut at top */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <ITitle />
                </Icon>
              }
              title="Title"
              right={
                !isEdit ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        fontWeight: 950,
                        fontSize: 13,
                        color: "rgba(255,255,255,0.92)",
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,122,24,0.25)",
                        background: "rgba(255,122,24,0.08)",
                        userSelect: "none",
                      }}
                    >
                      <Icon size={16} color="var(--dht-orange)">
                        <IShareMini />
                      </Icon>
                      Shared
                    </div>

                    <Toggle checked={shareShortcutOn} onChange={onToggleShareShortcut} disabled={busy} />
                  </div>
                ) : null
              }
            />

            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Drink water"
              style={baseField}
              disabled={busy}
            />
          </section>

          {/* 2) Type */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <IType />
                </Icon>
              }
              title="Type"
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <select value={type} onChange={(e) => setType(e.target.value as TaskType)} style={cleanSelect} disabled={busy}>
                <option value="habit">Habit (recurring)</option>
                <option value="single">Single (one-time)</option>
              </select>

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
                    <select value={freqPer} onChange={(e) => setFreqPer(e.target.value as FrequencyUnit)} style={cleanSelect} disabled={busy}>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div style={{ opacity: 0.8, fontSize: 13 }}>Single tasks don’t need frequency.</div>
              )}
            </div>
          </section>

          {/* 3) Scheduled days */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <ICalendar />
                </Icon>
              }
              title="Scheduled days"
              subtitle={
                <>
                  Current: <b style={{ color: "var(--dht-orange)" }}>{fmtScheduledDays(scheduledDays)}</b>
                </>
              }
            />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DOW.map((x) => {
                const active = scheduledDays == null ? true : scheduledDays.includes(x.n);
                return <DayPill key={x.n} label={x.label} active={active} disabled={busy} onClick={() => toggleDay(x.n)} />;
              })}
            </div>
          </section>

          {/* 4) Weekly skips */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <ISkips />
                </Icon>
              }
              title="Weekly skips allowed"
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
              <div>
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
              <div style={{ fontSize: 13, opacity: 0.78 }}>Allows misses without “failing” the week.</div>
            </div>
          </section>

          {/* 5) Reminders */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <ReminderEditor drafts={draftReminders} setDrafts={setDraftReminders} />
          </section>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <SoftButton disabled={busy} onClick={() => router.push("/tasks")}>
              Cancel
            </SoftButton>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {isEdit ? (
                <DangerButton disabled={busy} onClick={deleteTask}>
                  Delete task
                </DangerButton>
              ) : null}

              <SoftButton disabled={busy || !readyToSave} onClick={saveTask} orangeBorder>
                {primaryText}
              </SoftButton>
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
