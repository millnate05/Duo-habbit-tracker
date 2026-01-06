// FORCE NEW COMMIT: 2026-01-06-1615
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

// Treat "done today" using LOCAL DATE (user’s device time)
function isCompletedToday(completedAtIso: string) {
  const d = new Date(completedAtIso);
  const now = new Date();

  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [latestByTask, setLatestByTask] = useState<Record<string, CompletionRow>>(
    {}
  );

  // NEW: store which tasks should be hidden today (instant UI removal after completion)
  const [hiddenTaskIds, setHiddenTaskIds] = useState<Set<string>>(new Set());

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

    // reset hidden list whenever we load fresh
    setHiddenTaskIds(new Set());

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
      setLatestByTask({});
      setLoading(false);
      return;
    }

    const nextTasks = (tasksData ?? []) as TaskRow[];
    setTasks(nextTasks);

    // 2) Latest completions (we’ll pull recent ones and keep first per task)
    const { data: compData, error: compErr } = await supabase
      .from("completions")
      .select("*")
      .eq("user_id", uid)
      .order("completed_at", { ascending: false })
      .limit(300);

    if (compErr) {
      console.error(compErr);
      setStatus(compErr.message);
      setLatestByTask({});
      setLoading(false);
      return;
    }

    const map: Record<string, CompletionRow> = {};
    for (const c of (compData ?? []) as CompletionRow[]) {
      if (!map[c.task_id]) map[c.task_id] = c;
    }
    setLatestByTask(map);

    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      setTasks([]);
      setLatestByTask({});
      setHiddenTaskIds(new Set());
      setLoading(false);
      return;
    }
    loadHomeData(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // NEW: only show tasks that are NOT completed today AND not manually hidden
  const activeTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (hiddenTaskIds.has(t.id)) return false;
      const last = latestByTask[t.id];
      if (!last?.completed_at) return true;
      return !isCompletedToday(last.completed_at);
    });
  }, [tasks, latestByTask, hiddenTaskIds]);

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

    const completing = completeTask; // capture to avoid state timing issues
    setBusy(true);
    setStatus(null);

    try {
      const safeName = file.name.replace(/[^\w.\-()]+/g, "_");
      const path = `${userId}/${completing.id}/${Date.now()}_${safeName}`;

      // Upload to Storage bucket "proofs"
      const { error: upErr } = await supabase.storage
        .from("proofs")
        .upload(path, file, { upsert: false });

      if (upErr) throw upErr;

      // Insert completion row
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

      // Update latest completion in UI
      const completion = data as CompletionRow;

      setLatestByTask((prev) => ({
        ...prev,
        [completing.id]: completion,
      }));

      // NEW: Hide immediately so it "goes away" as soon as proof is submitted
      setHiddenTaskIds((prev) => {
        const next = new Set(prev);
        next.add(completing.id);
        return next;
      });

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

    const completing = completeTask; // capture
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

      setLatestByTask((prev) => ({
        ...prev,
        [completing.id]: completion,
      }));

      // NEW: hide immediately on override too
      setHiddenTaskIds((prev) => {
        const next = new Set(prev);
        next.add(completing.id);
        return next;
      });

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
      // Create signed URL (works with private bucket)
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

  // Logged out view
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
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Home</h1>
          <p style={{ margin: "8px 0 0 0", opacity: 0.8 }}>
            Log in to see your tasks and complete them with proof.
          </p>

          <div style={{ height: 14 }} />

          <section
            style={{
              border: "1px solid var(--border)",
              borderRadius: 16,
              padding: 16,
              background: "rgba(255,255,255,0.02)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
            }}
          >
            <Link
              href="/profile"
              style={{
                display: "inline-block",
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                color: "var(--text)",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              Go to Profile
            </Link>
          </section>
        </div>
      </main>
    );
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
                Logged in as <b>{sessionEmail}</b> • Remaining today:{" "}
                <b>{activeTasks.length}</b>
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
          ) : activeTasks.length === 0 ? (
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
              {activeTasks.map((t) => {
                const last = latestByTask[t.id];
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
                          <>Habit • {formatFrequency(t)}</>
                        ) : (
                          <>Single</>
                        )}
                        {last?.completed_at ? (
                          <span>
                            {" "}
                            • Last done:{" "}
                            {new Date(last.completed_at).toLocaleString()}
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
                  onClick={() =>
                    setPhotoViewer({ open: false, url: null, title: "" })
                  }
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
