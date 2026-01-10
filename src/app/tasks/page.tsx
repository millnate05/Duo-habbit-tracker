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

  const [editOpen, setEditOpen] = useState(false);
  const [editTask, setEditTask] = useState<TaskRow | null>(null);

  // AUTH
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

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  async function loadTasks(uid: string) {
    setLoading(true);
    setStatus(null);

    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      setStatus(error.message);
      setTasks([]);
      setLoading(false);
      return;
    }

    setTasks(data as TaskRow[]);
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

  function toggleDay(
    day: number,
    current: number[] | null,
    setFn: (v: number[] | null) => void
  ) {
    const base = current ?? [0, 1, 2, 3, 4, 5, 6];
    const set = new Set(base);
    set.has(day) ? set.delete(day) : set.add(day);
    const next = Array.from(set).sort((a, b) => a - b);
    next.length === 7 ? setFn(null) : setFn(next);
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
      const payload = {
        user_id: userId,

        // ✅ REQUIRED FOR RLS
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
      console.error(e);
      setStatus(e?.message ?? "Failed to create task.");
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
      setTasks((prev) =>
        prev.map((x) => (x.id === t.id ? (data as TaskRow) : x))
      );
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to update task.");
    } finally {
      setBusy(false);
    }
  }

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
    <main style={{ minHeight: theme.layout.fullHeight, padding: 24 }}>
      <h1>Tasks</h1>

      <section>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
        />
        <button onClick={createTask} disabled={busy}>
          Create
        </button>
      </section>

      {loading ? (
        <p>Loading…</p>
      ) : (
        activeTasks.map((t) => (
          <div key={t.id}>
            {t.title}
            <button onClick={() => toggleArchive(t)}>Archive</button>
          </div>
        ))
      )}
    </main>
  );
}
