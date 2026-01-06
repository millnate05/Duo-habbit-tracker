"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "@/UI/theme";
import { supabase } from "@/lib/supabaseClient";

type TaskMini = {
  id: string;
  title: string;
  type: "habit" | "single";
};

type CompletionRow = {
  id: string;
  task_id: string;
  user_id: string;
  proof_type: "photo" | "override";
  proof_note: string | null;
  photo_path: string | null;
  completed_at: string;
  // IMPORTANT: Supabase join is coming back as an array here
  tasks?: TaskMini[]; // <-- FIX
};

function startOfTodayLocalISO() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  return start.toISOString();
}

function formatDayAndDate(now: Date) {
  const day = now.toLocaleDateString(undefined, { weekday: "long" });
  const date = now.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return { day, date };
}

export default function CompletedPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const [now, setNow] = useState<Date>(() => new Date());
  const { day, date } = useMemo(() => formatDayAndDate(now), [now]);

  const [rows, setRows] = useState<CompletionRow[]>([]);

  // Keep date/day fresh + auto-reset list when the day changes
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

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

  async function loadToday(uid: string) {
    setLoading(true);
    setStatus(null);

    const since = startOfTodayLocalISO();

    const { data, error } = await supabase
      .from("completions")
      .select(
        `
        id,
        task_id,
        user_id,
        proof_type,
        proof_note,
        photo_path,
        completed_at,
        tasks:tasks ( id, title, type )
      `
      )
      .eq("user_id", uid)
      .gte("completed_at", since)
      .order("completed_at", { ascending: false });

    if (error) {
      console.error(error);
      setStatus(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // Strongly-typed safe set (no cast mismatch)
    setRows((data ?? []) as CompletionRow[]);
    setLoading(false);
  }

  // Reload when user changes
  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    loadToday(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Reload when day changes (auto “reset”)
  useEffect(() => {
    if (!userId) return;
    loadToday(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now.toDateString(), userId]);

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
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 36, fontWeight: 900 }}>{day}</h1>
            <div style={{ marginTop: 6, opacity: 0.85, fontSize: 16 }}>{date}</div>
            {userId && sessionEmail ? (
              <div style={{ marginTop: 8, opacity: 0.75 }}>
                Logged in as <b>{sessionEmail}</b>
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link
              href="/"
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                color: "var(--text)",
                textDecoration: "none",
                fontWeight: 900,
              }}
            >
              Home
            </Link>

            {userId ? (
              <Link
                href="/tasks"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
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

        <div style={{ height: 16 }} />

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

        <div style={{ height: 12 }} />

        {/* Card */}
        <section
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900 }}>Completed Today</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            {userId ? (
              <>
                Total: <b>{rows.length}</b>
              </>
            ) : (
              <>Log in to see today’s completed tasks.</>
            )}
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
              This page is user-based. Log in to view your completions.
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
          ) : rows.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              Nothing completed yet today.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((c) => {
                const task = c.tasks?.[0] ?? null; // <-- FIX: tasks is an array
                return (
                  <div
                    key={c.id}
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
                      <div style={{ fontWeight: 900 }}>{task?.title ?? "Task"}</div>
                      <div style={{ opacity: 0.8, marginTop: 4 }}>
                        {new Date(c.completed_at).toLocaleTimeString(undefined, {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                        {" • "}
                        {c.proof_type === "photo"
                          ? "Photo proof"
                          : `Override${c.proof_note ? ` — ${c.proof_note}` : ""}`}
                      </div>
                    </div>

                    {c.proof_type === "photo" && c.photo_path ? (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase.storage
                              .from("proofs")
                              .createSignedUrl(c.photo_path!, 60);

                            if (error) throw error;
                            window.open(data.signedUrl, "_blank", "noopener,noreferrer");
                          } catch (e: any) {
                            console.error(e);
                            setStatus(e?.message ?? "Could not open photo.");
                          }
                        }}
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
                        View photo
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
