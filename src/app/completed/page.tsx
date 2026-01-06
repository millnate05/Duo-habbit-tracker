// FORCE NEW COMMIT: 2026-01-06-1805
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { theme } from "@/UI/theme";
import { supabase } from "@/lib/supabaseClient";

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

  // NEW (add these columns)
  scheduled_days: number[] | null; // 0=Sun ... 6=Sat
  weekly_skips_allowed: number; // default 0
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

// ---------- Local period boundaries ----------
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
// Week starts Monday (change if you want Sunday)
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

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [skips, setSkips] = useState<SkipRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const [completeTask, setCompleteTask] = useState<TaskRow | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideText, setOverrideText] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Signed URL viewer
  const [photoViewer, setPhotoViewer] = useState<{
    open: boolean;
    url: string | null;
    title: string;
  }>({ open: false, url: null, title: "" });

  // Tick so “day” rolls over without refresh
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
    const dayStartIso = startOfDayLocal(now).toISOString();
    const weekStartIso = startOfWeekLocal(now).toISOString();
    const yearStartIso = startOfYearLocal(now).toISOString(); // safe, simple

    // tasks
    const { data: tasksData, error: tasksErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", uid)
      .eq("archived", false)
      .order("created_at", { ascending: false });

    if (tasksErr) {
      setStatus(tasksErr.message);
      setTasks([]);
      setCompletions([]);
      setSkips([]);
      setLoading(false);
      return;
    }
    const nextTasks = (tasksData ?? []) as TaskRow[];
    setTasks(nextTasks);

    // completions (we use year start to support year/month/week logic without extra queries)
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

    // skips (only need current week to enforce weekly skip budget)
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

  // Reload on day rollover (so tasks reappear at midnight)
  useEffect(() => {
    if (!userId) return;
    loadHome(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayKey, userId]);

  // ---------- Derived maps ----------
  const now = useMemo(() => new Date(), [todayKey]); // re-evaluate when day changes
  const todayStart = useMemo(() => startOfDayLocal(now).getTime(), [now]);
  const weekStart = useMemo(() => startOfWeekLocal(now).getTime(), [now]);

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

  function countInPeriod(taskId: string, startMs: number, kind: "completion" | "skip") {
    const list = kind === "completion" ? (completionsByTask[taskId] ?? []) : (skipsByTask[taskId] ?? []);
    let count = 0;
    for (const row of list) {
      const ts =
        kind === "completion"
          ? new Date((row as CompletionRow).completed_at).getTime()
          : new Date((row as SkipRow).skipped_at).getTime();
      if (ts >= startMs) count++;
    }
    return count;
  }

  function hasEventToday(taskId: string) {
    const doneToday = countInPeriod(taskId, todayStart, "completion") > 0;
    const skippedToday = countInPeriod(taskId, todayStart, "skip") > 0;
    return doneToday || skippedToday;
  }

  function allowedToday(task: TaskRow) {
    // scheduled_days null => allowed every day
    if (!task.scheduled_days || task.scheduled_days.length === 0) return true;
    const dow = now.getDay(); // 0..6
    return task.scheduled_days.includes(dow);
  }

  function periodQuotaMet(task: TaskRow) {
    if (task.type !== "habit") {
      // "single": treat as one-and-done ever (if you want different behavior, we can)
      const everDone = (completionsByTask[task.id]?.length ?? 0) > 0;
      return everDone;
    }

    const freq = (task.freq_per ?? "week") as FrequencyUnit;
    const required = Math.max(1, Number(task.freq_times ?? 1));
    const start = periodStart(freq, now).getTime();
    const done = countInPeriod(task.id, start, "completion");
    return done >= required;
  }

  function dailyProgress(task: TaskRow) {
    // only applies to habits with freq_per === "day"
    const required = Math.max(1, Number(task.freq_times ?? 1));
    const done = countInPeriod(task.id, todayStart, "completion");
    const pct = clamp((done / required) * 100, 0, 100);
    return { done, required, pct };
  }

  function weeklySkipsUsed(taskId: string) {
    return countInPeriod(taskId, weekStart, "skip");
  }

  // ---------- What to show on Home ----------
  const homeTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.archived) return false;
      if (!allowedToday(t)) return false;

      // If the period quota is met, hide it (e.g., completed 3/3 this week)
      if (periodQuotaMet(t)) return false;

      // Hide if completed or skipped today (prevents re-show until tomorrow)
      // BUT: daily 2x/day should stay until it hits requirement today
      if (t.type === "habit" && (t.freq_per ?? "week") === "day") {
        const { done, required } = dailyProgress(t);
        if (done >= required) return false; // satisfied today
        // If done < required, it SHOULD remain visible even if doneToday
        // (because you want 50% complete etc)
        return true;
      }

      // For week/month/year tasks: once you do it today, hide until tomorrow
      if (hasEventToday(t.id)) return false;

      return true;
    });
  }, [tasks, todayKey, completionsByTask, skipsByTask]);

  // ---------- Actions ----------
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

      const { error: upErr } = await supabase.storage.from("proofs").upload(path, file, { upsert: false });
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

      const completion = data as CompletionRow;
      setCompletions((prev) => [completion, ...prev]); // instant UI update
      setCompleteTask(null);
    } catch (e: any) {
      setStatus(e?.message ?? 'Photo upload failed. Ensure the Storage bucket "proofs" exists.');
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

      const completion = data as CompletionRow;
      setCompletions((prev) => [completion, ...prev]); // instant UI update

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

    const used = weeklySkipsUsed(task.id);
    const allowed = Math.max(0, Number(task.weekly_skips_allowed ?? 0));
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

      setSkips((prev) => [data as SkipRow, ...prev]); // instant hide for today
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to skip.");
    } finally {
      setBusy(false);
    }
  }

  // ---------- Logged-out homepage (no tasks) ----------
  if (!userId) {
    return (
      <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
        <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center" }}>
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
          <h1 style={{ fontSize: "clamp(28px, 6vw, 40px)", fontWeight: 900, margin: 0 }}>“pain is privilege”</h1>

          <section style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.02)", boxShadow: "0 10px 24px rgba(0,0,0,0.20)", textAlign: "left" }}>
            <div style={{ fontSize: 22, fontWeight: 900 }}>Today</div>
            <div style={{ opacity: 0.8, marginTop: 4 }}>Log in to see your tasks.</div>
            <div style={{ height: 12 }} />
            <Link href="/profile" style={{ display: "inline-block", padding: "10px 12px", borderRadius: 12, border: `1px solid ${theme.accent.primary}`, color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Log in
            </Link>
          </section>
        </div>
      </main>
    );
  }

  // ---------- Logged-in homepage ----------
  return (
    <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center" }}>
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

        <h1 style={{ fontSize: "clamp(28px, 6vw, 40px)", fontWeight: 900, margin: 0 }}>“pain is privilege”</h1>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (!f) return;
            uploadPhotoAndComplete(f);
          }}
        />

        {status ? (
          <div style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)", textAlign: "left" }}>
            {status}
          </div>
        ) : null}

        <section style={{ width: "100%", border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.02)", boxShadow: "0 10px 24px rgba(0,0,0,0.20)", textAlign: "left" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>Today</div>
              <div style={{ opacity: 0.8, marginTop: 4 }}>
                Logged in as <b>{sessionEmail}</b> • Remaining: <b>{homeTasks.length}</b>
              </div>
            </div>

            <Link
              href="/tasks"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                color: "var(--text)",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              Manage Tasks
            </Link>
          </div>

          <div style={{ height: 12 }} />

          {loading ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>Loading…</div>
          ) : homeTasks.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>You’re done for today 🎉</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {homeTasks.map((t) => {
                const isDaily = t.type === "habit" && (t.freq_per ?? "week") === "day";
                const daily = isDaily ? dailyProgress(t) : null;

                const weekDone =
                  t.type === "habit" && (t.freq_per ?? "week") === "week"
                    ? countInPeriod(t.id, periodStart("week", now).getTime(), "completion")
                    : null;

                const weekReq = t.type === "habit" && (t.freq_per ?? "week") === "week" ? Math.max(1, Number(t.freq_times ?? 1)) : null;

                const skipsUsed = weeklySkipsUsed(t.id);
                const skipsAllowed = Math.max(0, Number(t.weekly_skips_allowed ?? 0));
                const skipsLeft = Math.max(0, skipsAllowed - skipsUsed);

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
                      <div style={{ opacity: 0.8, marginTop: 4 }}>
                        {t.type === "habit" ? <>Habit • {formatFrequency(t)}</> : <>Single</>}
                        {weekDone !== null && weekReq !== null ? (
                          <>
                            {" "}
                            • Week: <b>{weekDone}/{weekReq}</b>
                          </>
                        ) : null}
                        {skipsAllowed > 0 ? (
                          <>
                            {" "}
                            • Skips left this week: <b>{skipsLeft}</b>
                          </>
                        ) : null}
                      </div>

                      {/* Daily progress bar (orange) */}
                      {daily ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ opacity: 0.8, fontSize: 13 }}>
                            Today: <b>{daily.done}/{daily.required}</b> ({Math.round(daily.pct)}%)
                          </div>
                          <div
                            style={{
                              marginTop: 6,
                              width: "min(320px, 100%)",
                              height: 10,
                              borderRadius: 999,
                              border: "1px solid var(--border)",
                              overflow: "hidden",
                              background: "rgba(255,255,255,0.04)",
                            }}
                          >
                            <div
                              style={{
                                height: "100%",
                                width: `${daily.pct}%`,
                                background: "#f59e0b", // orange
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {/* Skip button (only makes sense for week-based tasks, but allowed for any task with skips_allowed > 0) */}
                      {skipsAllowed > 0 ? (
                        <button
                          onClick={() => skipTask(t)}
                          disabled={busy || skipsLeft <= 0}
                          style={{
                            padding: "10px 12px",
                            borderRadius: 12,
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--text)",
                            fontWeight: 900,
                            cursor: busy || skipsLeft <= 0 ? "not-allowed" : "pointer",
                            opacity: busy || skipsLeft <= 0 ? 0.6 : 1,
                          }}
                          type="button"
                        >
                          Skip
                        </button>
                      ) : null}

                      <button
                        onClick={() => openCompleteModal(t)}
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
                        type="button"
                      >
                        Complete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Complete modal */}
        {completeTask && (
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
              setCompleteTask(null);
              setOverrideOpen(false);
              setOverrideText("");
            }}
          >
            <div
              style={{
                width: "min(720px, 100%)",
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
                padding: 16,
                textAlign: "left",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontWeight: 900, fontSize: 18 }}>Complete: {completeTask.title}</div>
              <div style={{ opacity: 0.8, marginTop: 6 }}>Choose proof type.</div>

              <div style={{ height: 12 }} />

              {!overrideOpen ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={choosePhoto}
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
                    Photo proof
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setOverrideText("");
                      setOverrideOpen(true);
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
                    Override
                  </button>

                  <button
                    type="button"
                    onClick={() => setCompleteTask(null)}
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
                </div>
              ) : (
                <>
                  <div style={{ opacity: 0.8, marginTop: 6 }}>Override requires a note.</div>

                  <textarea
                    value={overrideText}
                    onChange={(e) => setOverrideText(e.target.value)}
                    placeholder="Explain the override…"
                    style={{
                      marginTop: 12,
                      width: "100%",
                      minHeight: 110,
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid var(--border)",
                      background: "transparent",
                      color: "var(--text)",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setOverrideOpen(false)}
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
                      Back
                    </button>

                    <button
                      type="button"
                      onClick={submitOverride}
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
                      Submit override
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Photo viewer modal (kept for your existing UI) */}
        {photoViewer.open && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.65)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 18,
              zIndex: 1000,
            }}
            onClick={() => setPhotoViewer({ open: false, url: null, title: "" })}
          >
            <div
              style={{
                width: "min(900px, 100%)",
                borderRadius: 16,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                boxShadow: "0 18px 40px rgba(0,0,0,0.5)",
                padding: 12,
                textAlign: "left",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: 8 }}>
                <div style={{ fontWeight: 900 }}>{photoViewer.title}</div>
                <button
                  type="button"
                  onClick={() => setPhotoViewer({ open: false, url: null, title: "" })}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>

              {photoViewer.url ? (
                <img src={photoViewer.url} alt="Proof" style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid var(--border)" }} />
              ) : (
                <div style={{ padding: 10, opacity: 0.8 }}>Loading…</div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
