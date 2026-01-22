"use client";

import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { theme } from "@/UI/theme";

/* ---------------- TYPES ---------------- */

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
  is_shared?: boolean;
  assigned_to?: string | null; // me | partner | both
};

type Cadence = "daily" | "weekly";

type ReminderDraft = {
  enabled: boolean;
  timezone: string;
  time_of_day: string;
  cadence: Cadence;
  days_of_week: number[];
};

/* ---------------- CONSTANTS ---------------- */

const DOW = [
  { n: 0, label: "Sun" },
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
];

const ORANGE = theme.accent.primary;

/* ---------------- HELPERS ---------------- */

function fmtScheduledDays(days: number[] | null) {
  if (!days || days.length === 0) return "Every day";
  return days.map((d) => DOW.find((x) => x.n === d)?.label).join(", ");
}

function parseBoundedInt(raw: string, opts: { min: number; max: number; fallback: number }) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return opts.fallback;
  return Math.max(opts.min, Math.min(opts.max, Math.floor(n)));
}

function guessTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Los_Angeles";
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

/* ---------------- GLOBAL CSS FIXES ---------------- */

const globalFixesCSS = `
input, select, textarea, button { font-size: 16px; } /* prevent mobile zoom */
`;

/* ---------------- ICON ---------------- */

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: "inline-flex", color: ORANGE }}>
      {children}
    </span>
  );
}

/* ---------------- BUTTONS ---------------- */

function PrimaryButton({ children, onClick, disabled }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "14px 18px",
        borderRadius: 16,
        background: ORANGE,
        color: "#000",
        fontWeight: 900,
        border: "none",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SoftButton({ children, onClick, disabled, selected }: any) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "10px 14px",
        borderRadius: 14,
        border: `1px solid ${selected ? ORANGE : "var(--border)"}`,
        background: selected ? "rgba(255,255,255,0.08)" : "transparent",
        color: "var(--text)",
        fontWeight: 800,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

/* ---------------- MAIN ---------------- */

function CreateOrEditTaskInner() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");
  const isEdit = !!editId;

  const [userId, setUserId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");

  const [isShared, setIsShared] = useState(false);
  const [assignedTo, setAssignedTo] = useState<"me" | "partner" | "both">("me");

  const [freqTimesStr, setFreqTimesStr] = useState("1");
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");

  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowedStr, setWeeklySkipsAllowedStr] = useState("0");

  const [draftReminders, setDraftReminders] = useState<ReminderDraft[]>([]);

  const titleRef = useRef<HTMLInputElement>(null);

  const baseField: React.CSSProperties = {
    padding: "12px",
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--text)",
    width: "100%",
    fontSize: 16,
    fontWeight: 700,
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user.id ?? null);
      setTimeout(() => titleRef.current?.focus(), 50);
    });
  }, []);

  const times = useMemo(
    () => parseBoundedInt(freqTimesStr, { min: 1, max: 365, fallback: 1 }),
    [freqTimesStr]
  );

  const readyToSave = title.trim() && (type !== "habit" || times >= 1);

  async function saveTask() {
    if (!userId || busy) return;
    setBusy(true);

    const payload = {
      title: title.trim(),
      type,
      freq_times: type === "habit" ? times : null,
      freq_per: type === "habit" ? freqPer : null,
      scheduled_days: scheduledDays,
      weekly_skips_allowed: Number(weeklySkipsAllowedStr),
      is_shared: isShared,
      assigned_to: isShared ? assignedTo : "me",
      user_id: userId,
      archived: false,
    };

    if (!isEdit) {
      await supabase.from("tasks").insert(payload);
    } else {
      await supabase.from("tasks").update(payload).eq("id", editId);
    }

    router.push("/tasks");
    router.refresh();
  }

  return (
    <main style={{ padding: 20, paddingBottom: 140 }}>
      <style>{globalFixesCSS}</style>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ textAlign: "center", fontWeight: 900 }}>
          {isEdit ? "Edit Task" : "New Task"}
        </h1>

        {/* TITLE */}
        <section>
          <label>Title</label>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={baseField}
            placeholder="Drink water"
          />
        </section>

        {/* TYPE */}
        <section>
          <label>Type</label>
          <select value={type} onChange={(e) => setType(e.target.value as TaskType)} style={baseField}>
            <option value="habit">Habit</option>
            <option value="single">Single</option>
          </select>
        </section>

        {/* SHARE */}
        <section>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <strong>Share this task?</strong>
            <input type="checkbox" checked={isShared} onChange={() => setIsShared(!isShared)} />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <SoftButton selected={assignedTo === "me"} onClick={() => setAssignedTo("me")}>
              Me
            </SoftButton>
            <SoftButton disabled={!isShared} selected={assignedTo === "partner"} onClick={() => setAssignedTo("partner")}>
              Partner
            </SoftButton>
            <SoftButton disabled={!isShared} selected={assignedTo === "both"} onClick={() => setAssignedTo("both")}>
              Both
            </SoftButton>
          </div>
        </section>

        {/* STICKY ACTION BAR */}
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: 14,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(10px)",
            display: "flex",
            justifyContent: "center",
          }}
        >
          <PrimaryButton disabled={!readyToSave || busy} onClick={saveTask}>
            {isEdit ? "Save Changes" : "Create Task"}
          </PrimaryButton>
        </div>
      </div>
    </main>
  );
}

export default function CreateOrEditTaskPage() {
  return (
    <Suspense fallback={<div />}>
      <CreateOrEditTaskInner />
    </Suspense>
  );
}
