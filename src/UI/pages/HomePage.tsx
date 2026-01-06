// FORCE NEW COMMIT: 2026-01-06-1310
// src/app/page.tsx (or wherever your HomePage lives)

"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "@/UI/theme";

type TaskType = "habit" | "single";
type FrequencyUnit = "day" | "week" | "month";

type HabitFrequency = {
  every: number;
  unit: FrequencyUnit;
};

type Task = {
  id: string;
  title: string;
  type: TaskType;
  frequency?: HabitFrequency;
  createdAt: number;
  archived: boolean;
};

const STORAGE_KEY = "duo_tasks_v1";

function formatFrequency(freq?: HabitFrequency) {
  if (!freq) return "";
  const n = Math.max(1, freq.every);
  const unit =
    n === 1 ? freq.unit : (freq.unit + "s") as `${FrequencyUnit}s`;
  return `Every ${n} ${unit}`;
}

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Load tasks from localStorage (same storage as /tasks page)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Task[];
      if (Array.isArray(parsed)) setTasks(parsed);
    } catch {
      // ignore
    }
  }, []);

  const visibleTasks = useMemo(() => {
    return tasks
      .filter((t) => (showArchived ? true : !t.archived))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks, showArchived]);

  const activeCount = useMemo(
    () => tasks.filter((t) => !t.archived).length,
    [tasks]
  );

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

        {/* Tasks summary card */}
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
              <div style={{ fontSize: 22, fontWeight: 900 }}>Your Tasks</div>
              <div style={{ opacity: 0.8, marginTop: 4 }}>
                Active: <b>{activeCount}</b> • Total: <b>{tasks.length}</b>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  background: "rgba(255,255,255,0.02)",
                  userSelect: "none",
                }}
              >
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Show archived
              </label>

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
                Manage
              </Link>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {visibleTasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              No tasks yet. Go to <b>Manage</b> to create one.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {visibleTasks.map((t) => (
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
                  }}
                >
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 900 }}>{t.title}</div>
                    <div style={{ opacity: 0.8, marginTop: 4 }}>
                      {t.type === "habit" ? (
                        <>Habit • {formatFrequency(t.frequency)}</>
                      ) : (
                        <>Single</>
                      )}
                      {t.archived ? <span> • Archived</span> : null}
                    </div>
                  </div>

                  <div style={{ opacity: 0.7, fontSize: 13 }}>
                    {new Date(t.createdAt).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
