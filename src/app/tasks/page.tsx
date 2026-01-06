// src/app/tasks/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { theme } from "@/UI/theme";

type TaskType = "habit" | "single";
type FrequencyUnit = "day" | "week" | "month" | "year";

type HabitFrequency = {
  times: number; // ✅ how many times
  per: FrequencyUnit; // ✅ per day/week/month/year
};

type Proof = {
  kind: "photo" | "override";
  note?: string; // required for override
  photoName?: string; // basic metadata (we are not storing image data in localStorage)
  completedAt: number;
};

type Task = {
  id: string;
  title: string;
  type: TaskType;
  frequency?: HabitFrequency; // only for habit
  createdAt: number;
  archived: boolean;

  // completion snapshot (latest)
  lastCompletedAt?: number;
  lastProof?: Proof;
};

const STORAGE_KEY = "duo_tasks_v2"; // ✅ bump version since frequency model changed

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatFrequency(freq?: HabitFrequency) {
  if (!freq) return "";
  const t = Math.max(1, freq.times);
  const per = freq.per;
  return `${t}x per ${per}`;
}

const selectStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "#000",
  color: "#fff",
  outline: "none",
  cursor: "pointer",
};

const optionStyle: React.CSSProperties = {
  background: "#000",
  color: "#fff",
};

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");

  // ✅ habit frequency inputs (times per period)
  const [times, setTimes] = useState<number>(3);
  const [per, setPer] = useState<FrequencyUnit>("week");

  const [showArchived, setShowArchived] = useState(false);

  // Load from localStorage
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

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch {
      // ignore
    }
  }, [tasks]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((t) => (showArchived ? true : !t.archived));
  }, [tasks, showArchived]);

  function addTask() {
    const clean = title.trim();
    if (!clean) return;

    const next: Task = {
      id: uid(),
      title: clean,
      type,
      frequency:
        type === "habit"
          ? { times: Math.max(1, Number(times) || 1), per }
          : undefined,
      createdAt: Date.now(),
      archived: false,
    };

    setTasks((prev) => [next, ...prev]);
    setTitle("");
  }

  function updateTask(id: string, patch: Partial<Task>) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...patch } : t))
    );
  }

  function updateHabitFrequency(id: string, freq: HabitFrequency) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === id
          ? {
              ...t,
              type: "habit",
              frequency: {
                times: Math.max(1, Number(freq.times) || 1),
                per: freq.per,
              },
            }
          : t
      )
    );
  }

  function archiveTask(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, archived: true } : t))
    );
  }

  function unarchiveTask(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, archived: false } : t))
    );
  }

  function deleteTask(id: string) {
    const ok = window.confirm("Delete this task? This cannot be undone.");
    if (!ok) return;
    setTasks((prev) => prev.filter((t) => t.id !== id));
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
          gap: 16,
        }}
      >
        {/* Page Header */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
            <p style={{ margin: "6px 0 0 0", opacity: 0.8 }}>
              Habits are recurring as “times per period”. Singles are one-offs.
            </p>
          </div>

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
        </div>

        {/* Create Task Card */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task name…"
              onKeyDown={(e) => {
                if (e.key === "Enter") addTask();
              }}
              style={{
                flex: "1 1 260px",
                padding: "12px 12px",
                borderRadius: 12,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                outline: "none",
              }}
            />

            {/* Toggle: Habit vs Single */}
            <div
              style={{
                display: "flex",
                border: "1px solid var(--border)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              <ToggleButton
                active={type === "habit"}
                onClick={() => setType("habit")}
                label="Habit"
              />
              <ToggleButton
                active={type === "single"}
                onClick={() => setType("single")}
                label="Single"
              />
            </div>

            {/* Frequency (only for habit) */}
            {type === "habit" && (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                }}
              >
                <span style={{ opacity: 0.85 }}>Times</span>
                <input
                  type="number"
                  min={1}
                  value={times}
                  onChange={(e) => setTimes(Number(e.target.value))}
                  style={{
                    width: 84,
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    outline: "none",
                  }}
                />
                <span style={{ opacity: 0.85 }}>per</span>
                <select
                  value={per}
                  onChange={(e) => setPer(e.target.value as FrequencyUnit)}
                  style={selectStyle}
                >
                  <option value="day" style={optionStyle}>
                    Day
                  </option>
                  <option value="week" style={optionStyle}>
                    Week
                  </option>
                  <option value="month" style={optionStyle}>
                    Month
                  </option>
                  <option value="year" style={optionStyle}>
                    Year
                  </option>
                </select>
              </div>
            )}

            <button
              onClick={addTask}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                background: "transparent",
                color: "var(--text)",
                fontWeight: 800,
                cursor: "pointer",
              }}
            >
              Add
            </button>
          </div>
        </section>

        {/* Task List */}
        <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {visibleTasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 18,
                opacity: 0.85,
              }}
            >
              No tasks yet{showArchived ? "." : " (archived are hidden)."}
            </div>
          ) : (
            visibleTasks.map((t) => (
              <TaskRow
                key={t.id}
                task={t}
                onArchive={() => archiveTask(t.id)}
                onUnarchive={() => unarchiveTask(t.id)}
                onDelete={() => deleteTask(t.id)}
                onSetType={(nextType) => {
                  if (nextType === "single") {
                    updateTask(t.id, { type: "single", frequency: undefined });
                  } else {
                    updateTask(t.id, {
                      type: "habit",
                      frequency: t.frequency ?? { times: 3, per: "week" },
                    });
                  }
                }}
                onUpdateFrequency={(freq) => updateHabitFrequency(t.id, freq)}
              />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function ToggleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      style={{
        padding: "10px 12px",
        border: "none",
        cursor: "pointer",
        background: active ? "rgba(255,255,255,0.08)" : "transparent",
        color: "var(--text)",
        fontWeight: 900,
      }}
    >
      {label}
    </button>
  );
}

function TaskRow({
  task,
  onArchive,
  onUnarchive,
  onDelete,
  onSetType,
  onUpdateFrequency,
}: {
  task: Task;
  onArchive: () => void;
  onUnarchive: () => void;
  onDelete: () => void;
  onSetType: (t: TaskType) => void;
  onUpdateFrequency: (freq: HabitFrequency) => void;
}) {
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 14,
        background: "rgba(255,255,255,0.02)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 220, flex: "1 1 260px" }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{task.title}</div>
        <div style={{ opacity: 0.8, marginTop: 4 }}>
          {task.type === "habit" ? (
            <>Habit • {formatFrequency(task.frequency)}</>
          ) : (
            <>Single</>
          )}
          {task.archived ? <span> • Archived</span> : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div
          style={{
            display: "flex",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <ToggleButton
            active={task.type === "habit"}
            onClick={() => onSetType("habit")}
            label="Habit"
          />
          <ToggleButton
            active={task.type === "single"}
            onClick={() => onSetType("single")}
            label="Single"
          />
        </div>

        {task.type === "habit" && (
          <div
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
            }}
          >
            <span style={{ opacity: 0.85 }}>Times</span>
            <input
              type="number"
              min={1}
              value={task.frequency?.times ?? 1}
              onChange={(e) =>
                onUpdateFrequency({
                  times: Number(e.target.value),
                  per: task.frequency?.per ?? "week",
                })
              }
              style={{
                width: 80,
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                outline: "none",
              }}
            />
            <span style={{ opacity: 0.85 }}>per</span>
            <select
              value={task.frequency?.per ?? "week"}
              onChange={(e) =>
                onUpdateFrequency({
                  times: task.frequency?.times ?? 1,
                  per: e.target.value as FrequencyUnit,
                })
              }
              style={selectStyle}
            >
              <option value="day" style={optionStyle}>
                Day
              </option>
              <option value="week" style={optionStyle}>
                Week
              </option>
              <option value="month" style={optionStyle}>
                Month
              </option>
              <option value="year" style={optionStyle}>
                Year
              </option>
            </select>
          </div>
        )}

        {task.archived ? (
          <button onClick={onUnarchive} style={actionBtnStyle()} type="button">
            Unarchive
          </button>
        ) : (
          <button onClick={onArchive} style={actionBtnStyle()} type="button">
            Archive
          </button>
        )}

        <button
          onClick={onDelete}
          style={{
            ...actionBtnStyle(),
            borderColor: "rgba(255, 80, 80, 0.55)",
          }}
          type="button"
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function actionBtnStyle(): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontWeight: 900,
    cursor: "pointer",
  };
}
