// FORCE NEW COMMIT: 2026-01-10-FIX-HOME-SHARED-FILTER
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

  // photo viewer
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

    // ✅ tasks:
    // show:
    // 1) your personal tasks: user_id = me AND is_shared = false
    // 2) shared tasks assigned to you: assigned_to = me AND is_shared = true
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

    // completions (from year start so week/month/year logic works)
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

    // skips (only current week needed)
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
      // one-and-done forever
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

  // ✅ Tasks shown on home (core logic)
  const homeTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.archived) return false;
      if (!allowedToday(t)) return false;

      // If you already satisfied this period, hide
      if (periodQuotaMet(t)) return false;

      const isDaily = t.type === "habit" && (t.freq_per ?? "week") === "day";

      if (isDaily) {
        // daily tasks stay visible until requirement is met (progress bar)
        const { done, required } = dailyProgress(t);
        return done < required;
      }

      // week/month/year: if you complete once today, hide until tomorrow
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

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f) uploadPhotoAndComplete(f);
          }}
        />

        {status ? (
          <div
            style={{
              width: "100%",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 12,
              background: "rgba(255,255,255,0.02)",
              textAlign: "left",
            }}
          >
            {status}
          </div>
        ) : null}

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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 22, fontWeight: 900 }}>Today</div>
              <div style={{ opacity: 0.8, marginTop: 4 }}>
                Logged in as <b>{sessionEmail}</b> • Remaining:{" "}
                <b>{homeTasks.length}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
          </div>

          <div style={{ height: 12 }} />

          {loading ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              Loading…
            </div>
          ) : homeTasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              You’re done for today 🎉
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {homeTasks.map((t) => {
                const isDaily =
                  t.type === "habit" && (t.freq_per ?? "week") === "day";
                const daily = isDaily ? dailyProgress(t) : null;

                const skipsAllowed = Math.max(
                  0,
                  Number(t.weekly_skips_allowed ?? 0)
                );
                const skipsUsed = weeklySkipsUsed(t.id);
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
                        {t.type === "habit" ? (
                          <>Habit • {formatFrequency(t)}</>
                        ) : (
                          <>Single</>
                        )}
                        {skipsAllowed > 0 ? (
                          <>
                            {" "}
                            • Skips left this week: <b>{skipsLeft}</b>
                          </>
                        ) : null}
                      </div>

                      {daily ? (
                        <div style={{ marginTop: 10 }}>
                          <div style={{ opacity: 0.8, fontSize: 13 }}>
                            Today:{" "}
                            <b>
                              {daily.done}/{daily.required}
                            </b>{" "}
                            ({Math.round(daily.pct)}%)
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
                                background: "#f59e0b",
                              }}
                            />
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
                            cursor:
                              busy || skipsLeft <= 0
                                ? "not-allowed"
                                : "pointer",
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
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                Complete: {completeTask.title}
              </div>
              <div style={{ opacity: 0.8, marginTop: 6 }}>
                Choose proof type.
              </div>

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
                  <div style={{ opacity: 0.8, marginTop: 6 }}>
                    Override requires a note.
                  </div>

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

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 10,
                      marginTop: 12,
                      flexWrap: "wrap",
                    }}
                  >
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
      </div>
    </main>
  );
}
