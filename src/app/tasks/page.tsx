"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { theme } from "@/UI/theme";

/* ================= TYPES ================= */

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

/* ================= CONSTANTS ================= */

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
  return [...days]
    .sort((a, b) => a - b)
    .map((d) => DOW.find((x) => x.n === d)?.label ?? "?")
    .join(", ");
}

function sanitizeTimes(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(999, Math.floor(n)));
}

function sanitizeSkips(v: string) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(7, Math.floor(n)));
}

/* ================= PAGE ================= */

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [freqTimes, setFreqTimes] = useState(1);
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowed, setWeeklySkipsAllowed] = useState(0);

  /* ================= AUTH ================= */

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUserId(u?.id ?? null);
      setSessionEmail(u?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      const u = session?.user ?? null;
      setUserId(u?.id ?? null);
      setSessionEmail(u?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  /* ================= LOAD TASKS ================= */

  async function loadTasks(uid: string) {
    setLoading(true);
    setStatus(null);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus(error.message);
      setTasks([]);
    } else {
      setTasks(data as TaskRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    loadTasks(userId);
  }, [userId]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((t) => t.archived), [tasks]);

  /* ================= CREATE TASK ================= */

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
      const payload = {
        user_id: userId,
        created_by: userId,
        assigned_to: userId,
        is_shared: false,
        title: t,
        type,
        archived: false,
        freq_times: type === "habit" ? freqTimes : null,
        freq_per: type === "habit" ? freqPer : null,
        scheduled_days: scheduledDays,
        weekly_skips_allowed: weeklySkipsAllowed,
      };

      const { data, error } = await supabase
        .from("tasks")
        .insert(payload)
        .select("*")
        .single();

      if (error) throw error;

      setTasks((prev) => [data as TaskRow, ...prev]);
      setTitle("");
      setType("habit");
      setFreqTimes(1);
      setFreqPer("week");
      setScheduledDays(null);
      setWeeklySkipsAllowed(0);
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to create task.");
    } finally {
      setBusy(false);
    }
  }

  /* ================= RENDER ================= */

  if (!userId) {
    return (
      <main style={{ minHeight: theme.layout.fullHeight, padding: 24 }}>
        <h1>Tasks</h1>
        <p>Log in to manage tasks.</p>
        <Link href="/profile">Go to Profile</Link>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 34, fontWeight: 900 }}>Tasks</h1>
        <div style={{ opacity: 0.8 }}>Logged in as <b>{sessionEmail}</b></div>

        {status && <div style={{ marginTop: 12 }}>{status}</div>}

        {/* CREATE */}
        <section style={{ marginTop: 24 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Task title"
          />
          <button onClick={createTask} disabled={busy}>
            Create
          </button>
        </section>

        {/* ACTIVE */}
        <section style={{ marginTop: 24 }}>
          <h2>Active Tasks</h2>
          {loading ? (
            <div>Loading…</div>
          ) : activeTasks.length === 0 ? (
            <div>No active tasks.</div>
          ) : (
            activeTasks.map((t) => (
              <div key={t.id} style={{ marginTop: 8 }}>
                {t.title}
              </div>
            ))
          )}
        </section>

        {/* ARCHIVED */}
        <section style={{ marginTop: 24 }}>
          <h2>Archived</h2>
          {archivedTasks.map((t) => (
            <div key={t.id}>{t.title}</div>
          ))}
        </section>
      </div>
    </main>
  );
}
