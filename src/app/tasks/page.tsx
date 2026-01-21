"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  is_shared?: boolean;
  assigned_to?: string | null;
};

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  completed_at: string;
};

/* ---------- colors / icons ---------- */

type TaskColor = { bg: string; text: "#000" | "#fff" };

const TASK_COLORS: TaskColor[] = [
  { bg: "#F59E0B", text: "#000" },
  { bg: "#3B82F6", text: "#fff" },
  { bg: "#22C55E", text: "#000" },
  { bg: "#EF4444", text: "#fff" },
  { bg: "#A855F7", text: "#fff" },
  { bg: "#06B6D4", text: "#000" },
  { bg: "#F97316", text: "#000" },
  { bg: "#84CC16", text: "#000" },
  { bg: "#0EA5E9", text: "#000" },
  { bg: "#111827", text: "#fff" },
];

function colorIndexFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % TASK_COLORS.length;
}

type IconKind = "water" | "lift" | "run" | "calendar" | "check";

function pickIconKind(title: string): IconKind {
  const t = title.toLowerCase();
  if (t.includes("water") || t.includes("hydrate")) return "water";
  if (t.includes("lift") || t.includes("gym") || t.includes("bench") || t.includes("squat")) return "lift";
  if (t.includes("run") || t.includes("walk") || t.includes("steps")) return "run";
  if (t.includes("calendar") || t.includes("schedule")) return "calendar";
  return "check";
}

function MiniIcon({ kind }: { kind: IconKind }) {
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="9" opacity="0.9" />
    </svg>
  );
}

/* ---------- progress helpers ---------- */

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function startOfWeek(d: Date) {
  const x = startOfDay(d);
  x.setDate(x.getDate() - x.getDay());
  return x;
}

function startOfMonth(d: Date) {
  const x = startOfDay(d);
  x.setDate(1);
  return x;
}

function startOfYear(d: Date) {
  const x = startOfDay(d);
  x.setMonth(0, 1);
  return x;
}

function getPeriodStart(freq: FrequencyUnit, now: Date) {
  if (freq === "day") return startOfDay(now);
  if (freq === "week") return startOfWeek(now);
  if (freq === "month") return startOfMonth(now);
  return startOfYear(now);
}

/* ---------- page ---------- */

export default function TasksPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserId(data.session?.user?.id ?? null);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;

    supabase
      .from("tasks")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setTasks((data ?? []) as TaskRow[]);
        setLoading(false);
      });

    supabase
      .from("completions")
      .select("id,task_id,completed_at")
      .eq("user_id", userId)
      .then(({ data }) => setCompletions((data ?? []) as CompletionRow[]));
  }, [userId]);

  const completionMap = useMemo(() => {
    const m = new Map<string, number>();
    completions.forEach((c) => {
      m.set(c.task_id, (m.get(c.task_id) ?? 0) + 1);
    });
    return m;
  }, [completions]);

  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedTasks = tasks.filter((t) => t.archived);

  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
        paddingBottom: 110,
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
          <Link href="/shared">Shared</Link>
        </div>

        <div style={{ height: 16 }} />

        {loading ? (
          <div>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {activeTasks.map((t) => {
              const { bg, text } = TASK_COLORS[colorIndexFromId(t.id)];
              const done = completionMap.get(t.id) ?? 0;
              const target = t.type === "habit" ? t.freq_times ?? 1 : 1;
              const pct = Math.min(1, done / target);

              return (
                <div
                  key={t.id}
                  style={{
                    background: bg,
                    color: text,
                    borderRadius: 18,
                    padding: "11px 12px",
                    boxShadow: "0 10px 22px rgba(0,0,0,0.45)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <MiniIcon kind={pickIconKind(t.title)} />
                    <div style={{ flex: 1, fontWeight: 900 }}>{t.title}</div>
                    <button onClick={() => router.push(`/tasks/create?id=${t.id}`)}>Edit</button>
                  </div>

                  <div
                    style={{
                      marginTop: 9,
                      height: 9,
                      borderRadius: 999,
                      background: "rgba(0,0,0,0.2)",
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(pct * 100)}%`,
                        background: "rgba(0,0,0,0.45)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ✅ BIG PLUS CREATE BUTTON */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
          <button
            onClick={() => router.push("/tasks/create")}
            aria-label="Create task"
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              background: theme.accent.primary,
              border: `2px solid ${theme.accent.primary}`,
              fontSize: 38,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
            }}
          >
            +
          </button>
        </div>

        {archivedTasks.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>Archived</h3>
            {archivedTasks.map((t) => (
              <div key={t.id}>{t.title}</div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
