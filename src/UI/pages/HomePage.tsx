// FORCE NEW COMMIT: 2026-01-10-FIX-HOME-SHARED-FILTER
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { theme } from "@/UI/theme";
import { supabase } from "@/lib/supabaseClient";
import SplashIntro from "@/UI/components/SplashIntro";

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

  scheduled_days?: number[] | null; // 0=Sun..6=Sat, null => every day
  weekly_skips_allowed?: number; // default 0

  // ✅ needed so home can correctly filter shared tasks
  is_shared?: boolean;
  assigned_to?: string | null;
};

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  proof_type: "photo" | "override";
  proof_note: string | null;
  photo_path: string | null;
  completed_at: string;
};

type SkipRow = {
  id: string;
  user_id: string;
  task_id: string;
  skipped_at: string;
};

function formatFrequency(t: TaskRow) {
  if (t.type !== "habit") return "";
  const times = Math.max(1, Number(t.freq_times ?? 1));
  const per = (t.freq_per ?? "week") as FrequencyUnit;
  return `${times}x per ${per}`;
}

// ---------- Local time helpers ----------
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
// Week starts Monday
function startOfWeekLocal(d: Date) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // Monday=0
  const start = startOfDayLocal(d);
  start.setDate(start.getDate() - diff);
  return start;
}
function startOfMonthLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}
function startOfYearLocal(d: Date) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function periodStart(freq: FrequencyUnit, now: Date) {
  switch (freq) {
    case "day":
      return startOfDayLocal(now);
    case "week":
      return startOfWeekLocal(now);
    case "month":
      return startOfMonthLocal(now);
    case "year":
      return startOfYearLocal(now);
    default:
      return startOfWeekLocal(now);
  }
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function formatDateHeader(d: Date) {
  // e.g. "Friday, January 16"
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [skips, setSkips] = useState<SkipRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Complete flow
  const [completeTask, setCompleteTask] = useState<TaskRow | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideText, setOverrideText] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Splash page (shows once per browser session)
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("splashDismissed");
    setShowSplash(!dismissed);
  }, []);

  function dismissSplash() {
    sessionStorage.setItem("splashDismissed", "1");
    setShowSplash(false);
  }

  // photo viewer (currently unused, but kept)
  const [photoViewer, setPhotoViewer] = useState<{
    open: boolean;
    url: string | null;
    title: string;
  }>({ open: false, url: null, title: "" });

  // Tick so day rolls without refresh
  const [todayKey, setTodayKey] = useState<string>(() => new Date().toDateString());
  useEffect(() => {
    const t = setInterval(() => setTodayKey(new Date().toDateString()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Auth
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

  async function loadHome(uid: string) {
    setLoading(true);
    setStatus(null);

    const now = new Date();
    const weekStartIso = startOfWeekLocal(now).toISOString();
    const yearStartIso = startOfYearLocal(now).toISOString();

    const { data: tasksData, error: tasksErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("archived", false)
      .or(
        `and(user_id.eq.${uid},is_shared.eq.false),and(assigned_to.eq.${uid},is_shared.eq.true)`
      )
      .order("created_at", { ascending: false });

    if (tasksErr) {
      setStatus(tasksErr.message);
      setTasks([]);
      setCompletions([]);
      setSkips([]);
      setLoading(false);
      return;
    }
    setTasks((tasksData ?? []) as TaskRow[]);

    const { data: compData, error: compErr } = await supabase
      .from("completions")
      .select("*")
      .eq("user_id", uid)
      .gte("completed_at", yearStartIso)
      .order("completed_at", { ascending: false })
      .limit(3000);

    if (compErr) {
      setStatus(compErr.message);
      setCompletions([]);
      setSkips([]);
      setLoading(false);
      return;
    }
    setCompletions((compData ?? []) as CompletionRow[]);

    const { data: skipData, error: skipErr } = await supabase
      .from("task_skips")
      .select("*")
      .eq("user_id", uid)
      .gte("skipped_at", weekStartIso)
      .order("skipped_at", { ascending: false })
      .limit(1000);

    if (skipErr) {
      setStatus(skipErr.message);
      setSkips([]);
      setLoading(false);
      return;
    }
    setSkips((skipData ?? []) as SkipRow[]);

    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setCompletions([]);
      setSkips([]);
      setLoading(false);
      return;
    }
    loadHome(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadHome(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, userId]);

  // Derived time markers
  const now = useMemo(() => new Date(), [todayKey]);
  const todayStartMs = useMemo(() => startOfDayLocal(now).getTime(), [now]);
  const weekStartMs = useMemo(() => startOfWeekLocal(now).getTime(), [now]);

  // Days left in current week (Mon..Sun)
  const daysLeftInWeek = useMemo(() => {
    const start = startOfWeekLocal(now);
    const endExclusive = new Date(start);
    endExclusive.setDate(endExclusive.getDate() + 7);
    const msLeft = endExclusive.getTime() - startOfDayLocal(now).getTime();
    return clamp(Math.ceil(msLeft / (24 * 60 * 60 * 1000)), 0, 7);
  }, [now]);

  // Group rows by task
  const completionsByTask = useMemo(() => {
    const m: Record<string, CompletionRow[]> = {};
    for (const c of completions) (m[c.task_id] ??= []).push(c);
    return m;
  }, [completions]);

  const skipsByTask = useMemo(() => {
    const m: Record<string, SkipRow[]> = {};
    for (const s of skips) (m[s.task_id] ??= []).push(s);
    return m;
  }, [skips]);

  function countCompletionsSince(taskId: string, startMs: number) {
    const list = completionsByTask[taskId] ?? [];
    let count = 0;
    for (const c of list) {
      if (new Date(c.completed_at).getTime() >= startMs) count++;
    }
    return count;
  }

  function countSkipsSince(taskId: string, startMs: number) {
    const list = skipsByTask[taskId] ?? [];
    let count = 0;
    for (const s of list) {
      if (new Date(s.skipped_at).getTime() >= startMs) count++;
    }
    return count;
  }

  function allowedToday(task: TaskRow) {
    const days = task.scheduled_days ?? null;
    if (!days || days.length === 0) return true;
    const dow = now.getDay(); // 0..6
    return days.includes(dow);
  }

  function didSomethingToday(taskId: string) {
    const done = countCompletionsSince(taskId, todayStartMs) > 0;
    const skipped = countSkipsSince(taskId, todayStartMs) > 0;
    return done || skipped;
  }

  function dailyProgress(task: TaskRow) {
    const required = Math.max(1, Number(task.freq_times ?? 1));
    const done = countCompletionsSince(task.id, todayStartMs);
    const pct = clamp((done / required) * 100, 0, 100);
    return { done, required, pct };
  }

  function periodQuotaMet(task: TaskRow) {
    if (task.type === "single") {
      return (completionsByTask[task.id]?.length ?? 0) > 0;
    }
    const freq = (task.freq_per ?? "week") as FrequencyUnit;
    const required = Math.max(1, Number(task.freq_times ?? 1));
    const start = periodStart(freq, now).getTime();
    const done = countCompletionsSince(task.id, start);
    return done >= required;
  }

  function weeklySkipsUsed(taskId: string) {
    return countSkipsSince(taskId, weekStartMs);
  }

  function weeklyProgress(task: TaskRow) {
    const weekDone = countCompletionsSince(task.id, weekStartMs);
    const required =
      task.type === "habit" && (task.freq_per ?? "week") === "week"
        ? Math.max(1, Number(task.freq_times ?? 1))
        : task.type === "habit"
        ? Math.max(1, Number(task.freq_times ?? 1))
        : 1;

    const pct = clamp((weekDone / required) * 100, 0, 100);
    return { done: weekDone, required, pct };
  }

  const homeTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.archived) return false;
      if (!allowedToday(t)) return false;
      if (periodQuotaMet(t)) return false;

      const isDaily = t.type === "habit" && (t.freq_per ?? "week") === "day";

      if (isDaily) {
        const { done, required } = dailyProgress(t);
        return done < required;
      }

      if (didSomethingToday(t.id)) return false;

      return true;
    });
  }, [tasks, todayKey, completionsByTask, skipsByTask]);

  function openCompleteModal(task: TaskRow) {
    setCompleteTask(task);
    setOverrideOpen(false);
    setOverrideText("");
    setStatus(null);
  }

  function choosePhoto() {
    if (!completeTask) return;
    fileInputRef.current?.click();
  }

  async function uploadPhotoAndComplete(file: File) {
    if (!userId || !completeTask) return;
    const completing = completeTask;

    setBusy(true);
    setStatus(null);

    try {
      const safeName = file.name.replace(/[^\w.\-()]+/g, "_");
      const path = `${userId}/${completing.id}/${Date.now()}_${safeName}`;

      const { error: upErr } = await supabase.storage
        .from("proofs")
        .upload(path, file, { upsert: false });
      if (upErr) throw upErr;

      const { data, error } = await supabase
        .from("completions")
        .insert({
          user_id: userId,
          task_id: completing.id,
          proof_type: "photo",
          proof_note: null,
          photo_path: path,
        })
        .select("*")
        .single();

      if (error) throw error;

      setCompletions((prev) => [data as CompletionRow, ...prev]);
      setCompleteTask(null);
    } catch (e: any) {
      setStatus(
        e?.message ??
          'Photo upload failed. Ensure the Storage bucket "proofs" exists.'
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function submitOverride() {
    if (!userId || !completeTask) return;
    const completing = completeTask;

    const note = overrideText.trim();
    if (!note) {
      setStatus("Override requires a note.");
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const { data, error } = await supabase
        .from("completions")
        .insert({
          user_id: userId,
          task_id: completing.id,
          proof_type: "override",
          proof_note: note,
          photo_path: null,
        })
        .select("*")
        .single();

      if (error) throw error;

      setCompletions((prev) => [data as CompletionRow, ...prev]);
      setOverrideOpen(false);
      setCompleteTask(null);
      setOverrideText("");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to submit override.");
    } finally {
      setBusy(false);
    }
  }

  async function skipTask(task: TaskRow) {
    if (!userId) return;

    const allowed = Math.max(0, Number(task.weekly_skips_allowed ?? 0));
    const used = weeklySkipsUsed(task.id);
    if (used >= allowed) {
      setStatus("No skips remaining for this task this week.");
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const { data, error } = await supabase
        .from("task_skips")
        .insert({ user_id: userId, task_id: task.id })
        .select("*")
        .single();

      if (error) throw error;

      setSkips((prev) => [data as SkipRow, ...prev]);
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to skip.");
    } finally {
      setBusy(false);
    }
  }

  // Logged out: show hero, NO tasks
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
        {showSplash ? (
          <SplashIntro
            imageSrc="/chris-bumstead-3.jpg.webp"
            quote="“pain is privilege”"
            onDismiss={dismissSplash}
          />
        ) : null}

        <div
          style={{
            maxWidth: 980,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 20,
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <img
            src="/chris-bumstead-3.jpg.webp"
            alt="Chris Bumstead"
            style={{
              width: "clamp(220px, 60vw, 520px)",
              height: "auto",
              maxWidth: "90vw",
              borderRadius: 12,
              border: `1px solid ${theme.accent.primary}`,
            }}
          />
          <h1
            style={{
              fontSize: "clamp(28px, 6vw, 40px)",
              fontWeight: 900,
              margin: 0,
            }}
          >
            “pain is privilege”
          </h1>

          <section
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 16,
              background: "rgba(255,255,255,0.02)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
              textAlign: "left",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900 }}>Welcome</div>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Log in to see your tasks, submit proof, and track completions.
            </div>
            <div style={{ height: 12 }} />
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link
                href="/profile"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: `1px solid ${theme.accent.primary}`,
                  color: "var(--text)",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Log in
              </Link>
              <Link
                href="/completed"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Completed
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  // Logged in: show tasks card
  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
      }}
    >
      {showSplash ? (
        <SplashIntro
          imageSrc="/chris-bumstead-3.jpg.webp"
          quote="“pain is privilege”"
          onDismiss={dismissSplash}
        />
      ) : null}

      {/* ...rest of your logged-in JSX stays the same... */}
      <div
        style={{
          maxWidth: 980,
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          gap: 20,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        {/* NOTE: you can remove the image + quote below if you want them ONLY on the splash */}
        <img
          src="/chris-bumstead-3.jpg.webp"
          alt="Chris Bumstead"
          style={{
            width: "clamp(220px, 60vw, 520px)",
            height: "auto",
            maxWidth: "90vw",
            borderRadius: 12,
            border: `1px solid ${theme.accent.primary}`,
          }}
        />

        <h1
          style={{
            fontSize: "clamp(28px, 6vw, 40px)",
            fontWeight: 900,
            margin: 0,
          }}
        >
          “pain is privilege”
        </h1>

        {/* keep the rest of your file unchanged from here */}
        {/* ... */}
      </div>
    </main>
  );
}
