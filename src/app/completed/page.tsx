"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { theme } from "@/UI/theme";

type TaskJoin = {
  title: string;
};

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  proof_type: "photo" | "override";
  proof_note: string | null;
  photo_path: string | null;
  completed_at: string;
  tasks?: TaskJoin[] | null;
};

type DayGroup = {
  key: string; // YYYY-MM-DD local
  date: Date;
  items: CompletionRow[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function localDayKeyFromISO(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function monthLabel(year: number, monthIndex0: number) {
  const d = new Date(year, monthIndex0, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function daysInMonth(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function startWeekdayOfMonth(year: number, monthIndex0: number) {
  return new Date(year, monthIndex0, 1).getDay(); // 0=Sun..6=Sat
}

// Stable “random” index per day key (so it won’t change every render)
function stableIndexFromKey(key: string, mod: number) {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return mod === 0 ? 0 : hash % mod;
}

export default function CompletedPage() {
  const [userId, setUserId] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({}); // photo_path -> signed url

  // Fullscreen viewer
  const [activePhotoUrl, setActivePhotoUrl] = useState<string | null>(null);
  const [activePhotoAlt, setActivePhotoAlt] = useState<string>("Proof");

  // Calendar month control
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex0, setMonthIndex0] = useState(now.getMonth());

  const listRef = useRef<HTMLDivElement | null>(null);

  // Close fullscreen on Esc
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActivePhotoUrl(null);
    }
    if (activePhotoUrl) window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activePhotoUrl]);

  // AUTH
  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!alive) return;
      if (error) setStatus(error.message);
      setUserId(data.session?.user?.id ?? null);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUserId(session?.user?.id ?? null);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // LOAD COMPLETIONS (only YOU)
  useEffect(() => {
    if (!userId) {
      setCompletions([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setStatus(null);

      const { data, error } = await supabase
        .from("completions")
        .select("id,user_id,task_id,proof_type,proof_note,photo_path,completed_at,tasks(title)")
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(500);

      if (error || !Array.isArray(data)) {
        console.error(error);
        setStatus(error?.message ?? "Failed to load completions");
        setCompletions([]);
        setLoading(false);
        return;
      }

      setCompletions(data);
      setLoading(false);
    })();
  }, [userId]);

  // SIGNED URLS FOR PHOTOS
  useEffect(() => {
    if (completions.length === 0) return;

    const needed = completions
      .map((c) => c.photo_path)
      .filter((p): p is string => !!p);

    const missing = needed.filter((p) => !photoUrls[p]);
    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const updates: Record<string, string> = {};
        const batchSize = 20;

        for (let i = 0; i < missing.length; i += batchSize) {
          const chunk = missing.slice(i, i + batchSize);
          for (const path of chunk) {
            const { data, error } = await supabase.storage
              .from("proofs")
              .createSignedUrl(path, 60 * 60);

            if (error) {
              console.warn("Signed URL failed for:", path, error.message);
              continue;
            }
            if (data?.signedUrl) updates[path] = data.signedUrl;
          }
        }

        if (!cancelled && Object.keys(updates).length > 0) {
          setPhotoUrls((prev) => ({ ...prev, ...updates }));
        }
      } catch (e: any) {
        console.error(e);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completions]);

  // GROUP BY LOCAL DAY
  const dayGroups: DayGroup[] = useMemo(() => {
    const map = new Map<string, CompletionRow[]>();

    for (const c of completions) {
      const key = localDayKeyFromISO(c.completed_at);
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }

    const keys = Array.from(map.keys()).sort((a, b) => (a > b ? -1 : 1));

    return keys.map((key) => {
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(y, (m ?? 1) - 1, d ?? 1);
      const items = (map.get(key) ?? []).slice().sort((a, b) =>
        a.completed_at > b.completed_at ? -1 : 1
      );
      return { key, date, items };
    });
  }, [completions]);

  const completionsByDayKey = useMemo(() => {
    const map = new Map<string, CompletionRow[]>();
    for (const g of dayGroups) map.set(g.key, g.items);
    return map;
  }, [dayGroups]);

  function jumpToDay(key: string) {
    const el = document.getElementById(`day-${key}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else listRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function goPrevMonth() {
    const d = new Date(year, monthIndex0, 1);
    d.setMonth(d.getMonth() - 1);
    setYear(d.getFullYear());
    setMonthIndex0(d.getMonth());
  }

  function goNextMonth() {
    const d = new Date(year, monthIndex0, 1);
    d.setMonth(d.getMonth() + 1);
    setYear(d.getFullYear());
    setMonthIndex0(d.getMonth());
  }

  // Calendar cells: ONLY the month’s days (1..end) + leading/trailing blanks
  const calendarCells = useMemo(() => {
    const totalDays = daysInMonth(year, monthIndex0);
    const startDow = startWeekdayOfMonth(year, monthIndex0);

    const blanksBefore = startDow; // number of empty cells before day 1
    const totalCells = blanksBefore + totalDays;
    const blanksAfter = (7 - (totalCells % 7)) % 7; // pad to full weeks
    const cellCount = totalCells + blanksAfter;

    const cells: Array<
      | { kind: "blank"; key: string }
      | { kind: "day"; day: number; key: string; date: Date }
    > = [];

    for (let i = 0; i < blanksBefore; i++) {
      cells.push({ kind: "blank", key: `blank-b-${i}` });
    }

    for (let day = 1; day <= totalDays; day++) {
      const date = new Date(year, monthIndex0, day);
      const key = `${year}-${pad2(monthIndex0 + 1)}-${pad2(day)}`;
      cells.push({ kind: "day", day, key, date });
    }

    for (let i = 0; i < blanksAfter; i++) {
      cells.push({ kind: "blank", key: `blank-a-${i}` });
    }

    // sanity: keep it week-aligned (28/35/42 cells depending on month)
    void cellCount;

    return cells;
  }, [year, monthIndex0]);

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
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Completed</h1>
          <p style={{ margin: "8px 0 0 0", opacity: 0.8 }}>
            Log in to view completed tasks.
          </p>

          <div style={{ height: 14 }} />

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
            Go to Profile (Log in)
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        height: "100vh",
        overflowY: "auto",
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
      }}
    >
      {/* Fullscreen image viewer */}
      {activePhotoUrl ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setActivePhotoUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.86)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              height: "100%",
              maxWidth: 1100,
              maxHeight: "92vh",
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
              }}
            >
              <div style={{ fontWeight: 900, opacity: 0.9 }}>{activePhotoAlt}</div>
              <button
                type="button"
                onClick={() => setActivePhotoUrl(null)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.18)",
                  background: "rgba(255,255,255,0.06)",
                  color: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                Close ✕
              </button>
            </div>

            <div
              style={{
                flex: 1,
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.14)",
                background: "rgba(255,255,255,0.03)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <img
                src={activePhotoUrl}
                alt={activePhotoAlt}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </div>

            <div style={{ opacity: 0.7, fontSize: 12 }}>
              Tip: press <b>Esc</b> to close.
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ maxWidth: 980, margin: "0 auto", paddingBottom: 40 }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
            alignItems: "flex-start",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Completed</h1>
            <div style={{ opacity: 0.7, marginTop: 6, fontSize: 13 }}>
              Your photo proofs by day.
            </div>
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
          </div>
        </div>

        <div style={{ height: 16 }} />

        {status ? (
          <div
            style={{
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 12,
              background: "rgba(255,255,255,0.02)",
              marginBottom: 16,
            }}
          >
            {status}
          </div>
        ) : null}

        {/* Calendar Card */}
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
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: 20, fontWeight: 900 }}>
              {monthLabel(year, monthIndex0)}
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={goPrevMonth}
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
                ← Prev
              </button>
              <button
                type="button"
                onClick={() => {
                  setYear(now.getFullYear());
                  setMonthIndex0(now.getMonth());
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
                Today
              </button>
              <button
                type="button"
                onClick={goNextMonth}
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
                Next →
              </button>
            </div>
          </div>

          <div style={{ height: 12 }} />

          {/* Weekday header */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 8,
              opacity: 0.85,
              fontWeight: 900,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} style={{ paddingLeft: 6 }}>
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid: only 1..end (with blanks) */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 8,
            }}
          >
            {calendarCells.map((cell) => {
              if (cell.kind === "blank") {
                return <div key={cell.key} style={{ height: 118 }} />;
              }

              const dayKey = cell.key;
              const items = completionsByDayKey.get(dayKey) ?? [];

              const photos = items
                .map((c) => c.photo_path)
                .filter((p): p is string => !!p)
                .map((p) => photoUrls[p])
                .filter((u): u is string => !!u);

              const pick = photos.length
                ? photos[stableIndexFromKey(dayKey, photos.length)]
                : null;

              const isToday =
                dayKey ===
                `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

              const title = items.length
                ? `${items.length} completion(s) — click to jump`
                : "No completions";

              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => jumpToDay(dayKey)}
                  style={{
                    position: "relative",
                    height: 118,
                    borderRadius: 14,
                    border: isToday
                      ? `1px solid ${theme.accent.primary}`
                      : "1px solid var(--border)",
                    background: "rgba(255,255,255,0.02)",
                    overflow: "hidden",
                    cursor: "pointer",
                    padding: 0,
                    textAlign: "left",
                    color: "var(--text)",
                  }}
                  title={title}
                >
                  {/* Big day image or No photo */}
                  {pick ? (
                    <img
                      src={pick}
                      alt="Proof"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        opacity: 0.8,
                      }}
                    >
                      No photo
                    </div>
                  )}

                  {/* Overlay for readability */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: pick
                        ? "linear-gradient(to top, rgba(0,0,0,0.70), rgba(0,0,0,0.10))"
                        : "transparent",
                    }}
                  />

                  {/* Day number */}
                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 10,
                      fontWeight: 900,
                      fontSize: 13,
                      textShadow: pick ? "0 1px 8px rgba(0,0,0,0.45)" : "",
                      opacity: 0.95,
                    }}
                  >
                    {cell.day}
                  </div>

                  {/* Small count badge */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: 8,
                      right: 10,
                      fontSize: 12,
                      fontWeight: 900,
                      opacity: items.length ? 0.95 : 0.6,
                      textShadow: pick ? "0 1px 8px rgba(0,0,0,0.45)" : "",
                    }}
                  >
                    {items.length ? `${items.length}` : "0"}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ height: 10 }} />
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Tip: Click a day to jump to that day’s completed proofs below.
          </div>
        </section>

        <div style={{ height: 16 }} />

        {/* Day-by-day feed (kept) */}
        <section
          ref={listRef}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.20)",
          }}
        >
          <div style={{ fontSize: 20, fontWeight: 900 }}>Completed proofs (by day)</div>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Total: <b>{completions.length}</b>
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
          ) : dayGroups.length === 0 ? (
            <div
              style={{
                border: "1px dashed var(--border)",
                borderRadius: 16,
                padding: 14,
                opacity: 0.85,
              }}
            >
              No completed tasks yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {dayGroups.map((g) => (
                <div
                  key={g.key}
                  id={`day-${g.key}`}
                  style={{
                    border: "1px solid var(--border)",
                    borderRadius: 14,
                    padding: 12,
                    background: "rgba(255,255,255,0.02)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      flexWrap: "wrap",
                      alignItems: "baseline",
                    }}
                  >
                    <div style={{ fontWeight: 900, fontSize: 16 }}>{dayLabel(g.date)}</div>
                    <div style={{ opacity: 0.85 }}>{g.items.length} completion(s)</div>
                  </div>

                  <div style={{ height: 10 }} />

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                    {g.items.map((c) => {
                      const title = c.tasks?.[0]?.title ?? c.proof_note ?? "Completed";
                      const url = c.photo_path ? photoUrls[c.photo_path] : null;

                      return (
                        <div
                          key={c.id}
                          style={{
                            width: 160,
                            borderRadius: 14,
                            overflow: "hidden",
                            border: "1px solid var(--border)",
                            background: "rgba(255,255,255,0.02)",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              if (!url) return;
                              setActivePhotoUrl(url);
                              setActivePhotoAlt(title);
                            }}
                            style={{
                              width: "100%",
                              height: 120,
                              padding: 0,
                              margin: 0,
                              border: "none",
                              background: "rgba(0,0,0,0.15)",
                              cursor: url ? "pointer" : "default",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                            }}
                            title={url ? "Click to view full screen" : "No photo"}
                          >
                            {url ? (
                              <img
                                src={url}
                                alt="Proof"
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            ) : (
                              <div style={{ opacity: 0.8, fontWeight: 900, fontSize: 12 }}>
                                No photo
                              </div>
                            )}
                          </button>

                          <div style={{ padding: 10 }}>
                            <div
                              style={{
                                fontWeight: 900,
                                fontSize: 13,
                                lineHeight: 1.2,
                              }}
                            >
                              {title}
                            </div>
                            <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>
                              {new Date(c.completed_at).toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
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
