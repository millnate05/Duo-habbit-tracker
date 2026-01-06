// FORCE NEW COMMIT: 2026-01-06-REWRITE-COMPLETED
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { theme } from "@/UI/theme";
import { supabase } from "@/lib/supabaseClient";

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  proof_type: "photo" | "override";
  proof_note: string | null;
  photo_path: string | null;
  completed_at: string;
};

type TaskRow = {
  id: string;
  title: string;
  type: "habit" | "single";
};

function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function formatHeaderDate(d: Date) {
  // Example: Tuesday, January 6, 2026
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function CompletedPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [todayKey, setTodayKey] = useState<string>(() => new Date().toDateString());

  const [rows, setRows] = useState<(CompletionRow & { task?: TaskRow | null })[]>([]);

  const [photoViewer, setPhotoViewer] = useState<{
    open: boolean;
    url: string | null;
    title: string;
  }>({ open: false, url: null, title: "" });

  // update key so day rolls over (auto-reset)
  useEffect(() => {
    const t = setInterval(() => setTodayKey(new Date().toDateString()), 30_000);
    return () => clearInterval(t);
  }, []);

  // auth
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

    const now = new Date();
    const startIso = startOfDayLocal(now).toISOString();

    // Pull today completions + join task title/type
    const { data, error } = await supabase
      .from("completions")
      .select(
        `
        id,
        user_id,
        task_id,
        proof_type,
        proof_note,
        photo_path,
        completed_at,
        tasks:task_id ( id, title, type )
      `
      )
      .eq("user_id", uid)
      .gte("completed_at", startIso)
      .order("completed_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error(error);
      setStatus(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    // Supabase join returns tasks as object (or null)
    const normalized =
      (data ?? []).map((r: any) => ({
        ...r,
        task: r.tasks ?? null,
      })) as (CompletionRow & { task?: TaskRow | null })[];

    setRows(normalized);
    setLoading(false);
  }

  useEffect(() => {
    if (!userId) {
      setRows([]);
      setLoading(false);
      return;
    }
    loadToday(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, todayKey]);

  async function viewPhoto(row: CompletionRow & { task?: TaskRow | null }) {
    if (!row.photo_path) return;

    setBusy(true);
    setStatus(null);

    try {
      const { data, error } = await supabase.storage
        .from("proofs")
        .createSignedUrl(row.photo_path, 60);

      if (error) throw error;

      setPhotoViewer({
        open: true,
        url: data.signedUrl,
        title: row.task?.title ? `Proof: ${row.task.title}` : "Proof",
      });
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Could not load photo.");
    } finally {
      setBusy(false);
    }
  }

  const headerDate = useMemo(() => formatHeaderDate(new Date()), [todayKey]);

  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Completed</h1>
            <div style={{ opacity: 0.85, marginTop: 6 }}>
              <b>{headerDate}</b>
            </div>
            {userId ? (
              <div style={{ opacity: 0.75, marginTop: 6 }}>
                Logged in as <b>{sessionEmail}</b>
              </div>
            ) : (
              <div style={{ opacity: 0.75, marginTop: 6 }}>
                Log in to see your completions.
              </div>
            )}
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
              Tasks
            </Link>

            {!userId ? (
              <Link
                href="/profile"
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  color: "var(--text)",
                  textDecoration: "none",
                  fontWeight: 900,
                }}
              >
                Log in
              </Link>
            ) : null}
          </div>
        </div>

        {status ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
            {status}
          </div>
        ) : null}

        <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.02)", boxShadow: "0 10px 24px rgba(0,0,0,0.20)" }}>
          {(!userId && !loading) ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              You’re not logged in, so there’s nothing to show here yet.
            </div>
          ) : loading ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              Loading…
            </div>
          ) : rows.length === 0 ? (
            <div style={{ border: "1px dashed var(--border)", borderRadius: 16, padding: 14, opacity: 0.85 }}>
              No completions yet today.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {rows.map((r) => (
                <div
                  key={r.id}
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
                  <div style={{ minWidth: 260 }}>
                    <div style={{ fontWeight: 900 }}>
                      {r.task?.title ?? `Task ${r.task_id}`}
                    </div>

                    <div style={{ opacity: 0.8, marginTop: 6 }}>
                      {r.task?.type ? <>{r.task.type === "habit" ? "Habit" : "Single"}</> : null}
                      {" "}
                      • Completed at{" "}
                      <b>{new Date(r.completed_at).toLocaleTimeString()}</b>
                      {" "}
                      • Proof:{" "}
                      <b>{r.proof_type === "photo" ? "Photo" : "Override"}</b>
                      {r.proof_type === "override" && r.proof_note ? (
                        <>
                          {" "}
                          — <span style={{ opacity: 0.9 }}>{r.proof_note}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  {r.proof_type === "photo" && r.photo_path ? (
                    <button
                      onClick={() => viewPhoto(r)}
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
                      View photo
                    </button>
                  ) : (
                    <span style={{ opacity: 0.65, fontSize: 13 }} />
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

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
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", padding: 8 }}>
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
                  style={{ width: "100%", height: "auto", borderRadius: 12, border: "1px solid var(--border)" }}
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
