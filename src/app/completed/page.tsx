"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { theme } from "@/UI/theme";

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  proof_type: "photo" | "override";
  proof_note: string | null;
  photo_path: string | null;
  completed_at: string;

  // PostgREST commonly returns joined tables as arrays
  tasks?: { title: string }[] | null;
};

type DayGroup = {
  key: string; // YYYY-MM-DD (local)
  date: Date; // local midnight-ish
  items: CompletionRow[];
};

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Build a local date key that won’t shift due to UTC parsing
function localDayKeyFromISO(iso: string) {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${pad2(m)}-${pad2(day)}`;
}

function dayLabel(d: Date) {
  // ex: "Sat, Jan 10, 2026"
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
  // day 0 of next month = last day of current month
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

function startWeekdayOfMonth(year: number, monthIndex0: number) {
  // 0=Sun..6=Sat
  return new Date(year, monthIndex0, 1).getDay();
}

function sameMonth(d: Date, year: number, monthIndex0: number) {
  return d.getFullYear() === year && d.getMonth() === monthIndex0;
}

export default function CompletedPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [completions, setCompletions] = useState<CompletionRow[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({}); // photo_path -> signed url

  // Calendar month control
  const now = useMemo(() => new Date(), []);
  const [year, setYear] = useState(now.getFullYear());
  const [monthIndex0, setMonthIndex0] = useState(now.getMonth()); // 0=Jan

  const listRef = useRef<HTMLDivElement | null>(null);

  // AUTH
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

  // LOAD COMPLETIONS
  useEffect(() => {
    if (!userId) {
      setCompletions([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setStatus(null);

      // Pull enough history to populate a calendar / scroll list
      // Adjust limit if you want more months visible.
      const { data, error } = await supabase
        .from("completions")
        .select(
          "id,user_id,task_id,proof_type,proof_note,photo_path,completed_at,tasks(title)"
        )
        .eq("user_id", userId)
        .order("completed_at", { ascending: false })
        .limit(300);

      if (error) {
        console.error(error);
        setStatus(error.message);
        setCompletions([]);
        setLoading(false);
        return;
      }

      setCompletions((data ?? []) as CompletionRow[]);
      setLoading(false);
    })();
  }, [userId]);

  // SIGNED URLS FOR PHOTOS
  useEffect(() => {
    if (completions.length === 0) return;

    const needed = completions
      .map((c) => c.photo_path)
      .filter((p): p is string => !!p);

    // Only create URLs we don't already have
    const missing = needed.filter((p) => !photoUrls[p]);

    if (missing.length === 0) return;

    let cancelled = false;

    (async () => {
      try {
        const updates: Record<string, string> = {};

        // Make signed URLs in small batches
        const batchSize = 20;
        for (let i = 0; i < missing.length; i += batchSize) {
          const chunk = missing.slice(i, i + batchSize);

          // Note: Supabase JS doesn't have a batch signed-url call,
          // so we do it serially inside each chunk to reduce hammering.
          for (const path of chunk) {
            const { data, error } = await supabase.storage
              .from("proofs")
              .createSignedUrl(path, 60 * 60); // 1 hour

            if (error) {
              // If a single image fails, just skip it.
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

    // Sort day keys descending
    const keys = Array.from(map.keys()).sort((a, b) => (a > b ? -1 : 1));

    return keys.map((key) => {
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(y, (m ?? 1) - 1, d ?? 1);
      const items = (map.get(key) ?? []).slice().sort((a, b) => {
        // newest first
        return a.completed_at > b.completed_at ? -1 : 1;
      });

      return { key, date, items };
    });
  }, [completions]);

  // Calendar grid for current month/year
  const calendarCells = useMemo(() => {
    const totalDays = daysInMonth(year, monthIndex0);
    const startDow = startWeekdayOfMonth(year, monthIndex0); // 0..6

    // Build a 6-week grid (42 cells) to keep layout stable
    const cells: { date: Date; inMonth: boolean; key: string }[] = [];

    // Start from the Sunday of the week containing the 1st of month
    const gridStart = new Date(year, monthIndex0, 1);
    gridStart.setDate(gridStart.getDate() - startDow);

    for (let i = 0; i < 42; i++) {
      const d = new Date(gridStart);
      d.setDate(gridStart.getDate() + i);
      const inMonth = sameMonth(d, year, monthIndex0);
      const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(
        d.getDate()
      )}`;
      cells.push({ date: d, inMonth, key });
    }

    // sanity (not strictly necessary)
    void totalDays;

    return cells;
  }, [year, monthIndex0]);

  const completionsByDayKey = useMemo(() => {
    const map = new Map<string, CompletionRow[]>();
    for (const g of dayGroups) map.set(g.key, g.items);
    return map;
  }, [dayGroups]);

  function jumpToDay(key: string) {
    const el = document.getElementById(`day-${key}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      // If the day section isn't present (maybe no completions),
      // just scroll to list area.
      listRef.current?.scrollIntoView({ behavior: "smooth" });
    }
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
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>
            Completed
          </h1>
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
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>
              Completed
            </h1>
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Logged in as <b>{sessionEmail}</b>
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

          {/* Calendar grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 8,
            }}
          >
            {calendarCells.map((cell) => {
              const items = completionsByDayKey.get(cell.key) ?? [];
              const cover = items.find((x) => x.photo_path)?.photo_path ?? null;
              const coverUrl = cover ? photoUrls[cover] : undefined;

              const isToday =
                cell.key ===
                `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(
                  now.getDate()
                )}`;

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => {
                    // Only jump if that day has items; still allow click to scroll to list
                    jumpToDay(cell.key);
                  }}
                  style={{
                    position: "relative",
                    height: 92,
                    borderRadius: 14,
                    border: isToday
                      ? `1px solid ${theme.accent.primary}`
                      : "1px solid var(--border)",
                    background: cell.inMonth
                      ? "rgba(255,255,255,0.02)"
                      : "rgba(255,255,255,0.01)",
                    overflow: "hidden",
                    cursor: "pointer",
                    padding: 0,
                    textAlign: "left",
                    color: "var(--text)",
                    opacity: cell.inMonth ? 1 : 0.55,
                  }}
                  title={
                    items.length
                      ? `${items.length} completion(s) — click to jump`
                      : "No completions"
                  }
                >
                  {/* Photo cover */}
                  {coverUrl ? (
                    <img
                      src={coverUrl}
                      alt="Proof"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: 0.92,
                      }}
                    />
                  ) : null}

                  {/* Dark overlay for legibility */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: coverUrl
                        ? "linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0.10))"
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
                      textShadow: coverUrl ? "0 1px 8px rgba(0,0,0,0.45)" : "",
                      opacity: 0.95,
                    }}
                  >
                    {cell.date.getDate()}
                  </div>

                  {/* Count pill */}
                  {items.length ? (
                    <div
                      style={{
                        position: "absolute",
                        bottom: 8,
                        left: 10,
                        padding: "4px 8px",
                        borderRadius: 999,
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(0,0,0,0.35)",
                        fontWeight: 900,
                        fontSize: 12,
                      }}
                    >
                      {items.length} done
                    </div>
                  ) : null}
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

        {/* Day-by-day feed */}
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
          <div style={{ fontSize: 20, fontWeight: 900 }}>
            Completed proofs (by day)
          </div>
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
                    <div style={{ fontWeight: 900, fontSize: 16 }}>
                      {dayLabel(g.date)}
                    </div>
                    <div style={{ opacity: 0.85 }}>
                      {g.items.length} completion(s)
                    </div>
                  </div>

                  <div style={{ height: 10 }} />

                  {/* Photos row */}
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    {g.items.map((c) => {
                      const title =
                        c.tasks?.[0]?.title ?? c.proof_note ?? "Completed";
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
                          <div
                            style={{
                              width: "100%",
                              height: 120,
                              background: "rgba(0,0,0,0.15)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              overflow: "hidden",
                            }}
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
                              <div
                                style={{
                                  opacity: 0.8,
                                  fontWeight: 900,
                                  fontSize: 12,
                                }}
                              >
                                No photo
                              </div>
                            )}
                          </div>

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
