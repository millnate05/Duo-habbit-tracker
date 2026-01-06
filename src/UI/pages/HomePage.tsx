// FORCE NEW COMMIT: 2026-01-06-1405
// src/app/page.tsx (or your HomePage file)

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { theme } from "@/UI/theme";

type TaskType = "habit" | "single";
type FrequencyUnit = "day" | "week" | "month" | "year";

type HabitFrequency = { times: number; per: FrequencyUnit };

type Proof = {
  kind: "photo" | "override";
  note?: string;
  photoName?: string;
  completedAt: number;
};

type Task = {
  id: string;
  title: string;
  type: TaskType;
  frequency?: HabitFrequency;
  createdAt: number;
  archived: boolean;

  lastCompletedAt?: number;
  lastProof?: Proof;
};

const STORAGE_KEY = "duo_tasks_v2";

function formatFrequency(freq?: HabitFrequency) {
  if (!freq) return "";
  const t = Math.max(1, freq.times);
  return `${t}x per ${freq.per}`;
}

export default function HomePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // override modal state
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideText, setOverrideText] = useState("");

  // photo input ref (hidden)
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load tasks
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

  // Save tasks
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  // ✅ Active only, no “show archived” UI/message
  const activeTasks = useMemo(() => {
    return tasks
      .filter((t) => !t.archived)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [tasks]);

  function setCompleted(taskId: string, proof: Proof) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === taskId
          ? {
              ...t,
              lastCompletedAt: proof.completedAt,
              lastProof: proof,
            }
          : t
      )
    );
  }

  function startComplete(taskId: string) {
    // basic choice prompt
    const choice = window.prompt(
      'Complete task:\nType "photo" for photo proof OR "override" for override.',
      "photo"
    );

    if (!choice) return;

    const normalized = choice.trim().toLowerCase();

    if (normalized === "photo") {
      setActiveTaskId(taskId);
      fileInputRef.current?.click();
      return;
    }

    if (normalized === "override") {
      setActiveTaskId(taskId);
      setOverrideText("");
      setOverrideOpen(true);
      return;
    }

    alert('Please type exactly "photo" or "override".');
  }

  function onPickedPhoto(file: File | null) {
    if (!file || !activeTaskId) return;

    // NOTE: We store only filename metadata, not the image itself (localStorage is not great for big files).
    setCompleted(activeTaskId, {
      kind: "photo",
      photoName: file.name,
      completedAt: Date.now(),
    });

    setActiveTaskId(null);
    // reset input so selecting same file again still triggers change
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submitOverride() {
    if (!activeTaskId) return;
    const note = overrideText.trim();
    if (!note) {
      alert("Override requires a note.");
      return;
    }

    setCompleted(activeTaskId, {
      kind: "override",
      note,
      completedAt: Date.now(),
    });

    setOverrideOpen(false);
    setOverrideText("");
    setActiveTaskId(null);
  }

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

        {/* Hidden file input for photo proof */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: "none" }}
          onChange={(e) => onPickedPhoto(e.target.files?.[0] ?? null)}
        />

        {/* Tasks card */}
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
                Active tasks: <b>{activeTasks.length}</b>
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

          {activeTasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              No active tasks yet. Create one in <b>Manage Tasks</b>.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {activeTasks.map((t) => (
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
                  <div style={{ minWidth: 220 }}>
                    <div style={{ fontWeight: 900 }}>{t.title}</div>
                    <div style={{ opacity: 0.8, marginTop: 4 }}>
                      {t.type === "habit" ? (
                        <>Habit • {formatFrequency(t.frequency)}</>
                      ) : (
                        <>Single</>
                      )}
                      {t.lastCompletedAt ? (
                        <span>
                          {" "}
                          • Last done:{" "}
                          {new Date(t.lastCompletedAt).toLocaleString()}
                        </span>
                      ) : null}
                    </div>

                    {t.lastProof ? (
                      <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
                        Proof:{" "}
                        {t.lastProof.kind === "photo"
                          ? `Photo (${t.lastProof.photoName ?? "image"})`
                          : `Override — ${t.lastProof.note}`}
                      </div>
                    ) : null}
                  </div>

                  <button
                    onClick={() => startComplete(t.id)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 12,
                      border: `1px solid ${theme.accent.primary}`,
                      background: "transparent",
                      color: "var(--text)",
                      fontWeight: 900,
                      cursor: "pointer",
                    }}
                    type="button"
                  >
                    Complete
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Override modal */}
        {overrideOpen && (
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
              setOverrideOpen(false);
              setActiveTaskId(null);
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
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                Override completion
              </div>
              <div style={{ opacity: 0.8, marginTop: 6 }}>
                Provide a short reason (required).
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
                  onClick={() => {
                    setOverrideOpen(false);
                    setActiveTaskId(null);
                  }}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={submitOverride}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: `1px solid ${theme.accent.primary}`,
                    background: "transparent",
                    color: "var(--text)",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Submit override
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
