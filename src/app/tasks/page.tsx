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
  created_by: string | null;
  assigned_to: string | null;
  is_shared: boolean;

  title: string;
  type: TaskType;
  freq_times: number | null;
  freq_per: FrequencyUnit | null;
  archived: boolean;

  scheduled_days: number[] | null;
  weekly_skips_allowed: number;

  created_at: string;
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
  return days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => DOW.find((x) => x.n === d)?.label ?? "?")
    .join(", ");
}

function sanitizeTimes(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(1, Math.min(999, Math.floor(n))) : 1;
}

function sanitizeSkips(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(7, Math.floor(n))) : 0;
}

export default function TasksPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);

  // create form
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");
  const [freqTimes, setFreqTimes] = useState(1);
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowed, setWeeklySkipsAllowed] = useState(0);

  // auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUserId(u?.id ?? null);
      setEmail(u?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user?.id ?? null);
      setEmail(s?.user?.email ?? null);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function loadTasks(uid: string) {
    setLoading(true);
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
    if (userId) loadTasks(userId);
    else {
      setTasks([]);
      setLoading(false);
    }
  }, [userId]);

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);
  const archivedTasks = useMemo(() => tasks.filter((t) => t.archived), [tasks]);

  async function createTask() {
    if (!userId) return;

    const t = title.trim();
    if (!t) {
      setStatus("Task title required");
      return;
    }

    setBusy(true);
    setStatus(null);

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

    if (error) {
      console.error(error);
      setStatus(error.message);
      setBusy(false);
      return;
    }

    setTasks((prev) => [data as TaskRow, ...prev]);
    setTitle("");
    setType("habit");
    setFreqTimes(1);
    setFreqPer("week");
    setScheduledDays(null);
    setWeeklySkipsAllowed(0);
    setBusy(false);
  }

  async function toggleArchive(t: TaskRow) {
    if (!userId) return;

    setBusy(true);
    const { data, error } = await supabase
      .from("tasks")
      .update({ archived: !t.archived })
      .eq("id", t.id)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (!error && data) {
      setTasks((prev) => prev.map((x) => (x.id === t.id ? (data as TaskRow) : x)));
    }
    setBusy(false);
  }

  if (!userId) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Tasks</h1>
        <p>Log in to manage tasks.</p>
        <Link href="/profile">Go to Profile</Link>
      </main>
    );
  }

  return (
    <main style={{ minHeight: theme.layout.fullHeight, padding: 24 }}>
      <h1>Tasks</h1>
      <p>Logged in as <b>{email}</b></p>

      {status && <div>{status}</div>}

      <section>
        <h2>Create Task</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
        <select value={type} onChange={(e) => setType(e.target.value as TaskType)}>
          <option value="habit">Habit</option>
          <option value="single">Single</option>
        </select>

        {type === "habit" && (
          <>
            <input type="number" value={freqTimes} onChange={(e) => setFreqTimes(sanitizeTimes(e.target.value))} />
            <select value={freqPer} onChange={(e) => setFreqPer(e.target.value as FrequencyUnit)}>
              <option value="day">day</option>
              <option value="week">week</option>
              <option value="month">month</option>
              <option value="year">year</option>
            </select>
          </>
        )}

        <button onClick={createTask} disabled={busy}>Create</button>
      </section>

      <section>
        <h2>Active</h2>
        {loading ? "Loading..." : activeTasks.map((t) => (
          <div key={t.id}>
            <b>{t.title}</b>
            <button onClick={() => toggleArchive(t)}>Archive</button>
          </div>
        ))}
      </section>

      <section>
        <h2>Archived</h2>
        {archivedTasks.map((t) => (
          <div key={t.id}>
            <b>{t.title}</b>
            <button onClick={() => toggleArchive(t)}>Unarchive</button>
          </div>
        ))}
      </section>
    </main>
  );
}
