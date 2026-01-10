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
  return Number.isFinite(n) ? Math.max(1, Math.min(999, Math.floor(n))) : 1;
}

function sanitizeSkips(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(0, Math.min(7, Math.floor(n))) : 0;
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUserId(u?.id ?? null);
      setSessionEmail(u?.email ?? null);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUserId(s?.user?.id ?? null);
      setSessionEmail(s?.user?.email ?? null);
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
      setStatus("Task title is required.");
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const payload = {
        user_id: userId,

        // ✅ REQUIRED FOR RLS (THIS IS THE FIX)
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

  // everything else unchanged ↓↓↓
  // (edit, archive, UI, modal, styling remain identical)

  /* … rest of file continues exactly as before … */
}
