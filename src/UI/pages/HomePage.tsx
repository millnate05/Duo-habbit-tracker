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

// ---------- Color palette (10) ----------
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

// ---------- Minimal icons ----------
type IconKind =
  | "water"
  | "lift"
  | "run"
  | "stretch"
  | "sleep"
  | "read"
  | "meditate"
  | "food"
  | "calendar"
  | "check";

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
  if (t.includes("stretch") || t.includes("mobility") || t.includes("yoga")) return "stretch";
  if (t.includes("sleep") || t.includes("bed") || t.includes("nap")) return "sleep";
  if (t.includes("read") || t.includes("study") || t.includes("homework") || t.includes("school"))
    return "read";
  if (t.includes("meditate") || t.includes("breath") || t.includes("mindful")) return "meditate";
  if (t.includes("protein") || t.includes("meal") || t.includes("eat") || t.includes("macro"))
    return "food";
  if (t.includes("calendar") || t.includes("schedule") || t.includes("plan")) return "calendar";
  return "check";
}

function TaskMiniIcon({ kind, stroke }: { kind: IconKind; stroke: string }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: "0 0 24 24",
    style: { display: "block" as const },
  };
  const stroke2 = "rgba(255,255,255,0.75)";

  switch (kind) {
    case "water":
      return (
        <svg {...common} aria-label="water icon">
          <path
            d="M12 2 C10 6,7 9,7 13 a5 5 0 0 0 10 0 c0-4-3-7-5-11z"
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M9.8 14.2c.6 1.6 2 2.6 3.7 2.6"
            fill="none"
            stroke={stroke2}
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );

    case "lift":
      return (
        <svg {...common} aria-label="dumbbell icon">
          <path d="M6 10v4M18 10v4" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M8 9v6M16 9v6" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <path d="M9 12h6" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    case "run":
      return (
        <svg {...common} aria-label="runner icon">
          <circle cx="15" cy="6.5" r="1.8" fill="none" stroke={stroke} strokeWidth="2" />
          <path
            d="M10.5 21l2.3-5.2 2.6 1.4 2.2-4.2-3.2-1.8-1.3-2.6-3 1.3 1.1 2.4-2.6 3.4"
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      );

    case "calendar":
      return (
        <svg {...common} aria-label="calendar icon">
          <path d="M7 4v3M17 4v3" fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" />
          <rect x="5" y="6" width="14" height="14" rx="3" ry="3" fill="none" stroke={stroke} strokeWidth="2" />
          <path d="M6 9h12" fill="none" stroke={stroke2} strokeWidth="2" strokeLinecap="round" />
        </svg>
      );

    default:
      return (
        <svg {...common} aria-label="check icon">
          <path
            d="M7 12.5l3 3 7-7"
            fill="none"
            stroke={stroke}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

function CheckCircle({ stroke }: { stroke: string }) {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" aria-label="completed">
      <circle cx="12" cy="12" r="9" fill="none" stroke={stroke} strokeWidth="2" />
      <path
        d="M8 12.3l2.4 2.4L16.5 8.8"
        fill="none"
        stroke={stroke}
        strokeWidth="2.4"
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

  function allowedToday(task: TaskRow) {
    const days = task.scheduled_days ?? null;
    if (!days || days.length === 0) return true;
    const dow = now.getDay(); // 0..6
    return days.includes(dow);
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

  // ✅ Home tasks: NEVER hide due to completing/skipping today.
  // Keep it simple: show tasks due today (scheduled_days) and not archived.
  const homeTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (t.archived) return false;
      if (!allowedToday(t)) return false;
      return true;
    });
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

    // ✅ If no skips assigned to this task, show your message
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

        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <section
            style={{
              width: "100%",
              border: `1px solid ${theme.surface.border}`,
              borderRadius: 18,
              padding: 16,
              background: theme.surface.cardBg,
              boxShadow: theme.surface.shadow,
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
                  background: theme.button.ghostBg,
                }}
              >
                Log in
              </Link>
            </div>
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
        padding: 14,
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
          gap: 12,
        }}
      >
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

        {/* Centered header */}
        <div style={{ textAlign: "center", padding: "10px 4px 4px" }}>
          <div style={{ fontSize: 20, fontWeight: 900 }}>{formatDateHeader(now)}</div>
          <div style={{ opacity: 0.75, marginTop: 4, fontSize: 13 }}>
            Remaining: <b>{homeTasks.length}</b>
          </div>
        </div>

        {status ? (
          <div
            style={{
              width: "100%",
              border: `1px solid ${theme.surface.border}`,
              borderRadius: 14,
              padding: 12,
              background: theme.surface.cardBg,
              boxShadow: theme.surface.shadow,
            }}
          >
            {status}
          </div>
        ) : null}

        {loading ? (
          <div
            style={{
              border: `1px dashed ${theme.surface.border}`,
              borderRadius: 18,
              padding: "12px 14px",
              opacity: 0.85,
              background: theme.surface.cardBg,
              textAlign: "center",
            }}
          >
            Loading…
          </div>
        ) : homeTasks.length === 0 ? (
          <div
            style={{
              border: `1px dashed ${theme.surface.border}`,
              borderRadius: 18,
              padding: "12px 14px",
              opacity: 0.85,
              background: theme.surface.cardBg,
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

              // icon stroke: use task text color so it looks integrated
              const iconStroke = textIsBlack ? "rgba(0,0,0,0.92)" : "rgba(255,255,255,0.92)";

              return (
                <div
                  key={t.id}
                  style={{
                    width: "100%",
                    borderRadius: 28,
                    background: bg,
                    color: text,
                    position: "relative",
                    overflow: "hidden",
                    padding: "12px 14px",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.45)",
                    // ✅ Skipped today: gray out the pill but keep the base color
                    filter: skippedToday ? "grayscale(1)" : "none",
                    opacity: skippedToday ? 0.55 : 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 12,
                      paddingBottom: 11, // space for bottom bar
                    }}
                  >
                    {/* Left: icon + title on the same row */}
                    <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: "0 0 auto" }}>
                        {completedToday ? (
                          <CheckCircle stroke={iconStroke} />
                        ) : (
                          <TaskMiniIcon kind={kind} stroke={iconStroke} />
                        )}
                      </div>

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
                    </div>

                    {/* Middle: weekly #/# */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 12,
                          padding: "7px 10px",
                          borderRadius: 999,
                          whiteSpace: "nowrap",
                          background: textIsBlack ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)",
                          border: textIsBlack
                            ? "1px solid rgba(0,0,0,0.22)"
                            : "1px solid rgba(255,255,255,0.22)",
                          fontWeight: 900,
                        }}
                      >
                        {wk.done}/{wk.required}
                      </span>
                    </div>

                    {/* Right: Skip + Complete */}
                    <div style={{ display: "flex", gap: 10, flexWrap: "nowrap" }}>
                      {/* ✅ Skip ALWAYS visible */}
                      <button
                        onClick={() => skipTask(t)}
                        disabled={busy}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 18,
                          border: textIsBlack ? "1px solid rgba(0,0,0,0.28)" : "1px solid rgba(255,255,255,0.28)",
                          background: textIsBlack ? "rgba(0,0,0,0.18)" : "rgba(255,255,255,0.18)",
                          color: text,
                          fontWeight: 900,
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.6 : 1,
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
                          borderRadius: 18,
                          border: textIsBlack ? "1px solid rgba(0,0,0,0.32)" : "1px solid rgba(255,255,255,0.32)",
                          background: textIsBlack ? "rgba(0,0,0,0.24)" : "rgba(255,255,255,0.24)",
                          color: text,
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

                  {/* progress bar attached to bottom, full width */}
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      height: 9,
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

        {/* Complete modal (unchanged) */}
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
                border: `1px solid ${theme.surface.border}`,
                background: "rgba(10,10,10,0.96)",
                boxShadow: theme.surface.shadowHover,
                padding: 16,
                textAlign: "left",
                color: "var(--text)",
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
                      background: theme.button.ghostBg,
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
                      border: `1px solid ${theme.button.border}`,
                      background: theme.button.ghostBg,
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
                      border: `1px solid ${theme.button.border}`,
                      background: theme.button.ghostBg,
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
                      border: `1px solid ${theme.surface.border}`,
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
                        border: `1px solid ${theme.button.border}`,
                        background: theme.button.ghostBg,
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
                        background: theme.button.ghostBg,
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
