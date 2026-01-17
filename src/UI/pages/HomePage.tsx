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
  weekly_skips_allowed?: number;

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

// ---------- time helpers ----------
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function startOfWeekLocal(d: Date) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // Monday=0
  const start = startOfDayLocal(d);
  start.setDate(start.getDate() - diff);
  return start;
}
function startOfYearLocal(d: Date) {
  return new Date(d.getFullYear(), 0, 1, 0, 0, 0, 0);
}
function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}
function formatDateHeader(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

// ---------- color palette (10) ----------
type TaskColor = { bg: string; text: "#000" | "#fff" };
const TASK_COLORS: TaskColor[] = [
  { bg: "#F59E0B", text: "#000" }, // orange
  { bg: "#3B82F6", text: "#fff" }, // blue
  { bg: "#22C55E", text: "#000" }, // green
  { bg: "#EF4444", text: "#fff" }, // red
  { bg: "#A855F7", text: "#fff" }, // purple
  { bg: "#06B6D4", text: "#000" }, // cyan
  { bg: "#F97316", text: "#000" }, // orange2
  { bg: "#84CC16", text: "#000" }, // lime
  { bg: "#0EA5E9", text: "#000" }, // sky
  { bg: "#111827", text: "#fff" }, // near-black slate
];

function colorIndexFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % TASK_COLORS.length;
}

// ---------- icon picking ----------
type IconKind = "water" | "lift" | "run" | "calendar" | "check";

function pickIconKind(title: string): IconKind {
  const t = title.toLowerCase();
  if (t.includes("water") || t.includes("hydrate") || t.includes("drink")) return "water";
  if (
    t.includes("lift") ||
    t.includes("weights") ||
    t.includes("weight") ||
    t.includes("gym") ||
    t.includes("bench") ||
    t.includes("squat") ||
    t.includes("deadlift") ||
    t.includes("workout") ||
    t.includes("train")
  )
    return "lift";
  if (t.includes("run") || t.includes("cardio") || t.includes("walk") || t.includes("steps"))
    return "run";
  if (t.includes("calendar") || t.includes("schedule") || t.includes("plan")) return "calendar";
  return "check";
}

/**
 * Cleaner icons:
 * - solid shapes (fill=currentColor) rather than thin outlines
 * - minimal detail so they read clearly at small sizes
 */
function MiniIcon({ kind }: { kind: IconKind }) {
  const common = { width: 26, height: 26, viewBox: "0 0 24 24" };

  switch (kind) {
    case "water":
      return (
        <svg {...common} aria-label="water">
          <path
            d="M12 2c-2.2 4.2-6 7.3-6 11.2A6 6 0 0 0 12 19a6 6 0 0 0 6-5.8C18 9.3 14.2 6.2 12 2z"
            fill="currentColor"
            opacity="0.92"
          />
        </svg>
      );

    case "lift":
      return (
        <svg {...common} aria-label="dumbbell">
          <rect x="3" y="10" width="3" height="4" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="6.5" y="9" width="2.5" height="6" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="9.8" y="11" width="4.4" height="2" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="15" y="9" width="2.5" height="6" rx="1" fill="currentColor" opacity="0.92" />
          <rect x="18" y="10" width="3" height="4" rx="1" fill="currentColor" opacity="0.92" />
        </svg>
      );

    case "run":
      return (
        <svg {...common} aria-label="run">
          <circle cx="15.6" cy="6.6" r="1.6" fill="currentColor" opacity="0.92" />
          <path
            d="M9.2 20.6l2.1-4.7 2.4 1.2 2-3.8-3-1.7-1.1-2.3-2.7 1.2 1 2.2-2.5 3.1"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.92"
          />
        </svg>
      );

    case "calendar":
      return (
        <svg {...common} aria-label="calendar">
          <rect x="5" y="6.5" width="14" height="13" rx="3" fill="currentColor" opacity="0.92" />
          <rect x="7.2" y="9.1" width="9.6" height="1.8" rx="0.9" fill="rgba(0,0,0,0.25)" />
          <rect x="7.2" y="12" width="4.2" height="4.2" rx="1.2" fill="rgba(0,0,0,0.25)" />
        </svg>
      );

    default:
      return (
        <svg {...common} aria-label="check">
          <circle cx="12" cy="12" r="9" fill="currentColor" opacity="0.92" />
          <path
            d="M8.3 12.4l2.2 2.2 5.2-5.2"
            fill="none"
            stroke="rgba(0,0,0,0.28)"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

function CheckCircle({ color }: { color: string }) {
  return (
    <svg width={28} height={28} viewBox="0 0 24 24" aria-label="completed">
      <circle cx="12" cy="12" r="9" fill={color} opacity="0.92" />
      <path
        d="M8.2 12.4l2.2 2.2 5.4-5.4"
        fill="none"
        stroke="rgba(0,0,0,0.28)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);

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

  // Splash
  const [showSplash, setShowSplash] = useState(false);
  useEffect(() => {
    const dismissed = sessionStorage.getItem("splashDismissed");
    setShowSplash(!dismissed);
  }, []);
  function dismissSplash() {
    sessionStorage.setItem("splashDismissed", "1");
    setShowSplash(false);
  }

  // Tick
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
      .or(`and(user_id.eq.${uid},is_shared.eq.false),and(assigned_to.eq.${uid},is_shared.eq.true)`)
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

  const now = useMemo(() => new Date(), [todayKey]);
  const todayStartMs = useMemo(() => startOfDayLocal(now).getTime(), [now]);
  const weekStartMs = useMemo(() => startOfWeekLocal(now).getTime(), [now]);

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
    for (const c of list) if (new Date(c.completed_at).getTime() >= startMs) count++;
    return count;
  }

  function countSkipsSince(taskId: string, startMs: number) {
    const list = skipsByTask[taskId] ?? [];
    let count = 0;
    for (const s of list) if (new Date(s.skipped_at).getTime() >= startMs) count++;
    return count;
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

  function allowedToday(task: TaskRow) {
    const days = task.scheduled_days ?? null;
    if (!days || days.length === 0) return true;
    const dow = now.getDay();
    return days.includes(dow);
  }

  // ✅ never hide after completing/skipping today
  const homeTasks = useMemo(() => {
    return tasks.filter((t) => !t.archived && allowedToday(t));
  }, [tasks, todayKey]);

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

      const { error: upErr } = await supabase.storage.from("proofs").upload(path, file, {
        upsert: false,
      });
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
        e?.message ?? 'Photo upload failed. Ensure the Storage bucket "proofs" exists.'
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

    if (allowed <= 0) {
      setStatus("No skips assigned — you got this!");
      return;
    }

    const used = weeklySkipsUsed(task.id);
    const left = Math.max(0, allowed - used);

    if (left <= 0) {
      setStatus("You’re out of skips — you got this!");
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

  // Logged out
  if (!userId) {
    return (
      <main
        style={{
          minHeight: theme.layout.fullHeight,
          background: theme.page.background,
          color: theme.page.text,
          padding: 18,
        }}
      >
        {showSplash ? (
          <SplashIntro
            imageSrc="/chris-bumstead-3.jpg.webp"
            quote="“pain is privilege”"
            onDismiss={dismissSplash}
          />
        ) : null}

        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <section
            style={{
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 18,
              padding: 16,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            <div style={{ fontSize: 22, fontWeight: 900 }}>Welcome</div>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Log in to see your tasks, submit proof, and track completions.
            </div>
            <div style={{ height: 12 }} />
            <Link
              href="/profile"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                color: "var(--text)",
                textDecoration: "none",
                fontWeight: 900,
                display: "inline-block",
              }}
            >
              Log in
            </Link>
          </section>
        </div>
      </main>
    );
  }

  // Logged in
  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 12, // tighter so everything moves up
      }}
    >
      {showSplash ? (
        <SplashIntro
          imageSrc="/chris-bumstead-3.jpg.webp"
          quote="“pain is privilege”"
          onDismiss={dismissSplash}
        />
      ) : null}

      <div style={{ maxWidth: 980, margin: "0 auto" }}>
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

        {/* ✅ Only date. No "remaining". Tighter top spacing. */}
        <div style={{ textAlign: "center", padding: "6px 0 10px" }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{formatDateHeader(now)}</div>
        </div>

        {status ? (
          <div
            style={{
              marginBottom: 10,
              border: "1px solid rgba(255,255,255,0.12)",
              borderRadius: 14,
              padding: 12,
              background: "rgba(255,255,255,0.03)",
            }}
          >
            {status}
          </div>
        ) : null}

        {loading ? (
          <div
            style={{
              border: "1px dashed rgba(255,255,255,0.14)",
              borderRadius: 18,
              padding: "12px 14px",
              opacity: 0.85,
              background: "rgba(255,255,255,0.02)",
              textAlign: "center",
            }}
          >
            Loading…
          </div>
        ) : homeTasks.length === 0 ? (
          <div
            style={{
              border: "1px dashed rgba(255,255,255,0.14)",
              borderRadius: 18,
              padding: "12px 14px",
              opacity: 0.85,
              background: "rgba(255,255,255,0.02)",
              textAlign: "center",
            }}
          >
            You’re done for today 🎉
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {homeTasks.map((t) => {
              const { bg, text } = TASK_COLORS[colorIndexFromId(t.id)];
              const textIsBlack = text === "#000";

              const wk = weeklyProgress(t);

              const skipsAllowed = Math.max(0, Number(t.weekly_skips_allowed ?? 0));
              const skipsUsed = weeklySkipsUsed(t.id);
              const skipsLeft = Math.max(0, skipsAllowed - skipsUsed);

              const completedToday = countCompletionsSince(t.id, todayStartMs) > 0;
              const skippedToday = countSkipsSince(t.id, todayStartMs) > 0;

              const kind = pickIconKind(t.title);

              return (
                <div
                  key={t.id}
                  style={{
                    width: "100%",
                    borderRadius: 20, // ✅ less severe curve
                    background: bg,
                    color: text,
                    position: "relative",
                    overflow: "hidden",
                    padding: "12px 12px 13px",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.45)",
                    filter: skippedToday ? "grayscale(1)" : "none",
                    opacity: skippedToday ? 0.55 : 1,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10 }}>
                    {/* Icon */}
                    <div
                      style={{
                        flex: "0 0 auto",
                        width: 34,
                        height: 34,
                        borderRadius: 14,
                        background: textIsBlack ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.16)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: text, // icon uses currentColor
                      }}
                    >
                      {completedToday ? (
                        <CheckCircle color={text} />
                      ) : (
                        <MiniIcon kind={kind} />
                      )}
                    </div>

                    {/* Title */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: 16,
                          lineHeight: 1.1,
                          whiteSpace: "nowrap",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                        }}
                        title={t.title}
                      >
                        {t.title}
                      </div>
                      {/* middle info (keep simple) */}
                      <div style={{ marginTop: 6, opacity: 0.9, fontSize: 12, fontWeight: 900 }}>
                        {wk.done}/{wk.required} this week
                      </div>
                    </div>

                    {/* Buttons */}
                    <div style={{ display: "flex", gap: 10 }}>
                      <button
                        onClick={() => skipTask(t)}
                        disabled={busy}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: textIsBlack ? "1px solid rgba(0,0,0,0.22)" : "1px solid rgba(255,255,255,0.26)",
                          background: textIsBlack ? "rgba(0,0,0,0.14)" : "rgba(255,255,255,0.16)",
                          color: text,
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.65 : 1,
                        }}
                        type="button"
                        title={
                          skipsAllowed <= 0
                            ? "No skips assigned"
                            : skipsLeft <= 0
                            ? "Out of skips"
                            : "Skip this task"
                        }
                      >
                        Skip
                      </button>

                      <button
                        onClick={() => openCompleteModal(t)}
                        disabled={busy}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 14,
                          border: textIsBlack ? "1px solid rgba(0,0,0,0.26)" : `1px solid rgba(255,255,255,0.30)`,
                          background: textIsBlack ? "rgba(0,0,0,0.20)" : "rgba(255,255,255,0.22)",
                          color: text,
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.65 : 1,
                        }}
                        type="button"
                      >
                        Complete
                      </button>
                    </div>
                  </div>

                  {/* Progress bar attached to bottom */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 8,
                      background: textIsBlack ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${wk.pct}%`,
                        background: textIsBlack ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.70)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Complete modal */}
        {completeTask && (
          <div
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.62)",
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
                borderRadius: 18,
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(10,10,10,0.96)",
                boxShadow: "0 20px 55px rgba(0,0,0,0.55)",
                padding: 16,
                textAlign: "left",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                Complete: {completeTask.title}
              </div>
              <div style={{ opacity: 0.8, marginTop: 6 }}>Choose proof type.</div>

              <div style={{ height: 12 }} />

              {!overrideOpen ? (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
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
                      border: "1px solid rgba(255,255,255,0.18)",
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
                      border: "1px solid rgba(255,255,255,0.18)",
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
                      border: "1px solid rgba(255,255,255,0.14)",
                      background: "transparent",
                      color: "var(--text)",
                      outline: "none",
                      resize: "vertical",
                    }}
                  />

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={() => setOverrideOpen(false)}
                      disabled={busy}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid rgba(255,255,255,0.18)",
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
