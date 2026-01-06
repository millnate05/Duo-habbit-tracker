// src/app/tasks/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
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

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatFrequency(freq?: HabitFrequency) {
  if (!freq) return "";
  const n = Math.max(1, freq.every);
  const unit = n === 1 ? freq.unit : (freq.unit + "s") as `${FrequencyUnit}s`;
  return `Every ${n} ${unit}`;
}

const selectStyle: React.CSSProperties = {
  padding: "10px 10px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "#000", // ✅ black background
  color: "#fff", // ✅ white text
  outline: "none",
  cursor: "pointer",
};

const optionStyle: React.CSSProperties = {
  background: "#000", // ✅ black dropdown rows
  color: "#fff", // ✅ white text
};

export default function Page() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TaskType>("habit");

  // habit frequency inputs
  const [every, setEvery] = useState<number>(1);
  const [unit, setUnit] = useState<FrequencyUnit>("day");

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
          ? { every: Math.max(1, Number(every) || 1), unit }
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
                every: Math.max(1, Number(freq.every) || 1),
                unit: freq.unit,
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
              Create habits (recurring) or single tasks. Archive or delete any
              time.
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
                <span style={{ opacity: 0.85 }}>Every</span>
                <input
                  type="number"
                  min={1}
                  value={every}
                  onChange={(e) => setEvery(Number(e.target.value))}
                  style={{
                    width: 74,
                    padding: "10px 10px",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    background: "transparent",
                    color: "var(--text)",
                    outline: "none",
                  }}
                />
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value as FrequencyUnit)}
                  style={selectStyle} // ✅ black bg / white text
                >
                  <option value="day" style={optionStyle}>
                    Day(s)
                  </option>
                  <option value="week" style={optionStyle}>
                    Week(s)
                  </option>
                  <option value="month" style={optionStyle}>
                    Month(s)
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
                      frequency: t.frequency ?? { every: 1, unit: "day" },
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

      {/* Controls */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
        }}
      >
        {/* Type Toggle */}
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

        {/* Frequency editor (only for habit) */}
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
            <span style={{ opacity: 0.85 }}>Every</span>
            <input
              type="number"
              min={1}
              value={task.frequency?.every ?? 1}
              onChange={(e) =>
                onUpdateFrequency({
                  every: Number(e.target.value),
                  unit: task.frequency?.unit ?? "day",
                })
              }
              style={{
                width: 70,
                padding: "10px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text)",
                outline: "none",
              }}
            />
            <select
              value={task.frequency?.unit ?? "day"}
              onChange={(e) =>
                onUpdateFrequency({
                  every: task.frequency?.every ?? 1,
                  unit: e.target.value as FrequencyUnit,
                })
              }
              style={selectStyle} // ✅ black bg / white text
            >
              <option value="day" style={optionStyle}>
                Day(s)
              </option>
              <option value="week" style={optionStyle}>
                Week(s)
              </option>
              <option value="month" style={optionStyle}>
                Month(s)
              </option>
            </select>
          </div>
        )}

        {/* Archive / Delete */}
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
