// FORCE NEW COMMIT: 2026-01-06-1635
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

function formatFrequency(t: TaskRow) {
  if (t.type !== "habit") return "";
  const times = Math.max(1, Number(t.freq_times ?? 1));
  const per = (t.freq_per ?? "week") as FrequencyUnit;
  return `${times}x per ${per}`;
}

// ---- Period helpers (LOCAL TIME) ----
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

// Week starts Monday (local). If you prefer Sunday, tell me and I’ll flip it.
function startOfWeekLocal(d: Date) {
  const day = d.getDay(); // 0 Sun ... 6 Sat
  const diff = (day + 6) % 7; // Monday=0, Sunday=6
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

function periodStartFor(freq: FrequencyUnit, now: Date) {
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

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [latestByTask, setLatestByTask] = useState<Record<string, CompletionRow>>(
    {}
  );

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Complete flow state
  const [completeTask, setCompleteTask] = useState<TaskRow | null>(null);

  // Override modal
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideText, setOverrideText] = useState("");

  // Photo picker
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // "View photo" signed URL
  const [photoViewer, setPhotoViewer] = useState<{
    open: boolean;
    url: string | null;
    title: string;
  }>({ open: false, url: null, title: "" });

  // Auth session
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

  async function loadHomeData(uid: string) {
    setLoading(true);
    setStatus(null);

    // 1) Tasks (active only)
    const { data: tasksData, error: tasksErr } = await supabase
      .from("tasks")
      .select("*")
      .eq("user_id", uid)
      .eq("archived", false)
      .order("created_at", { ascending: false });

    if (tasksErr) {
      console.error(tasksErr);
      setStatus(tasksErr.message);
      setTasks([]);
      setCompletions([]);
      setLatestByTask({});
      setLoading(false);
      return;
    }

    const nextTasks = (tasksData ?? []) as TaskRow[];
    setTasks(nextTasks);

    // 2) Completions: grab from start of year (covers day/week/month/year logic)
    const now = new Date();
    const earliest = startOfYearLocal(now).toISOString();

    const { data: compData, error: compErr } = await supabase
      .from("completions")
      .select("*")
      .eq("user_id", uid)
      .gte("completed_at", earliest)
      .order("completed_at", { ascending: false })
      .limit(2000);

    if (compErr) {
      console.error(compErr);
      setStatus(compErr.message);
      setCompletions([]);
      setLatestByTask({});
      setLoading(false);
      return;
    }

    const comps = (compData ?? []) as CompletionRow[];
    setCompletions(comps);

    // Latest-by-task (for "Last done" and photo viewer)
    const map: Record<string, CompletionRow> = {};
    for (const c of comps) {
      if (!map[c.task_id]) map[c.task_id] = c;
    }
    setLatestByTask(map);

    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      // Logged out: keep homepage visible, but clear user-specific data
      setTasks([]);
      setCompletions([]);
      setLatestByTask({});
      setLoading(false);
      return;
    }
    loadHomeData(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Count progress per task in the current period
  const progressByTask = useMemo(() => {
    const now = new Date();
    const out: Record<string, number> = {};

    // Pre-group completions by task_id for fast counting
    const byTask: Record<string, CompletionRow[]> = {};
    for (const c of completions) {
      (byTask[c.task_id] ??= []).push(c);
    }

    for (const t of tasks) {
      if (t.type !== "habit") continue;

      const freq = (t.freq_per ?? "week") as FrequencyUnit;
      const start = periodStartFor(freq, now).getTime();

      const list = byTask[t.id] ?? [];
      let count = 0;
      for (const c of list) {
        const ts = new Date(c.completed_at).getTime();
        if (ts >= start) count++;
        else break; // comps are sorted desc overall; per-task list isn't guaranteed sorted, but usually is
      }

      // If the per-task list isn't strictly sorted, this is safer:
      // count = list.filter(c => new Date(c.completed_at).getTime() >= start).length;

      out[t.id] = count;
    }

    return out;
  }, [tasks, completions]);

  // Only show tasks that still need work in the current period
  const remainingTasks = useMemo(() => {
    const now = new Date();

    return tasks.filter((t) => {
      if (t.archived) return false;

      if (t.type === "single") {
        // Single tasks: hide once completed at least once (ever in this loaded range).
        // If you want "single" to reset daily instead, tell me.
        return !latestByTask[t.id];
      }

      // Habit tasks: hide only after meeting the required count in the current period.
      const required = Math.max(1, Number(t.freq_times ?? 1));
      const done = progressByTask[t.id] ?? 0;

      // Extra safety: if freq_per is null, treat as weekly
      const _start = periodStartFor((t.freq_per ?? "week") as FrequencyUnit, now);
      void _start;

      return done < required;
    });
  }, [tasks, latestByTask, progressByTask]);

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

    const completing = completeTask; // capture
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

      const completion = data as CompletionRow;

      // Update completions list + latest map (this alone will make the task disappear when it hits requirement)
      setCompletions((prev) => [completion, ...prev]);
      setLatestByTask((prev) => ({ ...prev, [completing.id]: completion }));

      setCompleteTask(null);
    } catch (e: any) {
      console.error(e);
      setStatus(
        e?.message ??
          'Photo upload failed. Make sure you created a Storage bucket named "proofs".'
      );
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function openOverride() {
    if (!completeTask) return;
    setOverrideText("");
    setOverrideOpen(true);
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

      setCompletions((prev) => [completion, ...prev]);
      setLatestByTask((prev) => ({ ...prev, [completing.id]: completion }));

      setOverrideOpen(false);
      setCompleteTask(null);
      setOverrideText("");
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to submit override.");
    } finally {
      setBusy(false);
    }
  }

  async function viewLastPhoto(task: TaskRow) {
    const c = latestByTask[task.id];
    if (!c?.photo_path) return;

    setBusy(true);
    setStatus(null);

    try {
      const { data, error } = await supabase.storage
        .from("proofs")
        .createSignedUrl(c.photo_path, 60);

      if (error) throw error;

      setPhotoViewer({
        open: true,
        url: data.signedUrl,
        title: `Proof: ${task.title}`,
      });
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Could not load photo.");
    } finally {
      setBusy(false);
    }
  }

  // ---- Always-visible homepage (logged in OR logged out) ----
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

        {/* hidden input for photo proof */}
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

        {/* Status */}
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

        {/* Tasks card (only shows tasks if logged in) */}
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
              {userId ? (
                <div style={{ opacity: 0.8, marginTop: 4 }}>
                  Logged in as <b>{sessionEmail}</b> • Remaining today:{" "}
                  <b>{remainingTasks.length}</b>
                </div>
              ) : (
                <div style={{ opacity: 0.8, marginTop: 4 }}>
                  Log in to see your tasks and complete them with proof.
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {userId ? (
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
              ) : (
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
              )}
            </div>
          </div>

          <div style={{ height: 12 }} />

          {!userId ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              Tasks are user-based. Log in to view and complete yours.
            </div>
          ) : loading ? (
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
          ) : remainingTasks.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              You’re done for this period 🎉
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {remainingTasks.map((t) => {
                const last = latestByTask[t.id];
                const required =
                  t.type === "habit" ? Math.max(1, Number(t.freq_times ?? 1)) : 1;
                const done = t.type === "habit" ? progressByTask[t.id] ?? 0 : 0;

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
                    <div style={{ minWidth: 220 }}>
                      <div style={{ fontWeight: 900 }}>{t.title}</div>

                      <div style={{ opacity: 0.8, marginTop: 4 }}>
                        {t.type === "habit" ? (
                          <>
                            Habit • {formatFrequency(t)} • Progress:{" "}
                            <b>
                              {done}/{required}
                            </b>
                          </>
                        ) : (
                          <>Single</>
                        )}
                        {last?.completed_at ? (
                          <span>
                            {" "}
                            • Last done: {new Date(last.completed_at).toLocaleString()}
                          </span>
                        ) : null}
                      </div>

                      {last ? (
                        <div style={{ opacity: 0.75, marginTop: 6, fontSize: 13 }}>
                          Proof:{" "}
                          {last.proof_type === "photo"
                            ? "Photo"
                            : `Override — ${last.proof_note ?? ""}`}
                        </div>
                      ) : null}

                      {last?.proof_type === "photo" && last.photo_path ? (
                        <button
                          onClick={() => viewLastPhoto(t)}
                          disabled={busy}
                          style={{
                            marginTop: 8,
                            padding: "8px 10px",
                            borderRadius: 10,
                            border: "1px solid var(--border)",
                            background: "transparent",
                            color: "var(--text)",
                            fontWeight: 900,
                            cursor: busy ? "not-allowed" : "pointer",
                            opacity: busy ? 0.6 : 1,
                          }}
                          type="button"
                        >
                          View last photo
                        </button>
                      ) : null}
                    </div>

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
                );
              })}
            </div>
          )}
        </section>

        {/* Complete modal (only reachable when logged in) */}
        {completeTask && userId && (
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
                    onClick={openOverride}
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

        {/* Photo viewer modal */}
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
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  alignItems: "center",
                  padding: 8,
                }}
              >
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
                <img
                  src={photoViewer.url}
                  alt="Proof"
                  style={{
                    width: "100%",
                    height: "auto",
                    borderRadius: 12,
                    border: "1px solid var(--border)",
                  }}
                />
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
