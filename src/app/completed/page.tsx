"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { theme } from "@/UI/theme";

/**
 * ASSUMPTIONS / EXPECTED DB FIELDS
 * --------------------------------
 * completions: id, user_id, task_id, proof_type, proof_note, photo_path, completed_at
 *
 * tasks join should ideally include:
 * - title
 * - scope or is_shared (to tell solo vs shared)
 * - created_by (who created the shared task)
 * - assigned_to or assignee_user_id or assigned_user_id (who it is assigned to)
 *
 * partnerships table assumed (adjust to your actual schema):
 * - user_a uuid, user_b uuid, status text ('accepted')
 *
 * If your task/partnership fields differ, search for:
 *   "CHANGE THESE IF NEEDED"
 */

type TaskJoin = {
  title: string;

  // CHANGE THESE IF NEEDED:
  // Use ONE of these approaches in your DB:
  scope?: "solo" | "shared" | null; // preferred
  is_shared?: boolean | null; // alternative
  created_by?: string | null; // who created the shared task
  assigned_to?: "self" | "partner" | "both" | null; // simple enum
  assignee_user_id?: string | null; // alternative if you store explicit user id
};

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  proof_type: "photo" | "override";
  proof_note: string | null;
  photo_path: string | null;
  completed_at: string;

  // PostgREST join comes back as arrays
  tasks?: TaskJoin[] | null;
};

type BucketKey = "solo" | "shared_you" | "shared_both" | "shared_partner";

type DayGroup = {
  key: string; // YYYY-MM-DD (local)
  date: Date;
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
  return new Date(year, monthIndex0, 1).getDay();
}

function sameMonth(d: Date, year: number, monthIndex0: number) {
  return d.getFullYear() === year && d.getMonth() === monthIndex0;
}

function bucketLabel(b: BucketKey) {
  switch (b) {
    case "solo":
      return "Solo";
    case "shared_you":
      return "Shared (Yours)";
    case "shared_both":
      return "Shared (Both)";
    case "shared_partner":
      return "Shared (Partner)";
  }
}

export default function CompletedPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [partnerId, setPartnerId] = useState<string | null>(null);

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

  // LOAD PARTNER ID (best effort)
  useEffect(() => {
    if (!userId) {
      setPartnerId(null);
      return;
    }

    (async () => {
      // CHANGE THESE IF NEEDED: partnerships schema
      // This tries to find an accepted partnership where user is either side.
      const { data, error } = await supabase
        .from("partnerships")
        .select("user_a,user_b,status")
        .or(`user_a.eq.${userId},user_b.eq.${userId}`)
        .eq("status", "accepted")
        .limit(1)
        .maybeSingle();

      if (error) {
        // If table doesn't exist yet or schema differs, don't hard-fail the page.
        console.warn("partner lookup failed:", error.message);
        setPartnerId(null);
        return;
      }

      if (!data) {
        setPartnerId(null);
        return;
      }

      const p =
        data.user_a === userId ? (data.user_b as string) : (data.user_a as string);
      setPartnerId(p ?? null);
    })();
  }, [userId]);

  // LOAD COMPLETIONS (you + partner if present)
  useEffect(() => {
    if (!userId) {
      setCompletions([]);
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setStatus(null);

      // Build user list for query
      const ids = partnerId ? [userId, partnerId] : [userId];

      // CHANGE THESE IF NEEDED: tasks join fields
      // NOTE: we intentionally pull extra task metadata to classify buckets.
      const { data, error } = await supabase
        .from("completions")
        .select(
          [
            "id",
            "user_id",
            "task_id",
            "proof_type",
            "proof_note",
            "photo_path",
            "completed_at",
            "tasks(title,scope,is_shared,created_by,assigned_to,assignee_user_id)",
          ].join(",")
        )
        .in("user_id", ids)
        .order("completed_at", { ascending: false })
        .limit(500);

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
  }, [userId, partnerId]);

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

  // Calendar grid for current month/year
  const calendarCells = useMemo(() => {
    const totalDays = daysInMonth(year, monthIndex0);
    const startDow = startWeekdayOfMonth(year, monthIndex0);

    const cells: { date: Date; inMonth: boolean; key: string }[] = [];

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

  // --- BUCKETING LOGIC ---
  // This is the heart of the “solo / shared-you / shared-both / shared-partner” split.
  // Adjust this if your schema differs.
  function classifyCompletion(c: CompletionRow): BucketKey {
    const t = c.tasks?.[0];

    const isShared =
      (t?.scope ? t.scope === "shared" : false) ||
      (typeof t?.is_shared === "boolean" ? t.is_shared : false);

    if (!isShared) return "solo";

    const createdBy = t?.created_by ?? null;

    // Option A: assigned_to enum
    const assignedTo = t?.assigned_to ?? null;

    // Option B: explicit assignee_user_id
    const assigneeUserId = t?.assignee_user_id ?? null;

    // BOTH takes priority
    if (assignedTo === "both") return "shared_both";

    // If explicit assignee id exists, use it (your shared task “lane”)
    if (assigneeUserId) {
      if (assigneeUserId === userId) return "shared_you";
      if (partnerId && assigneeUserId === partnerId) return "shared_partner";
    }

    // Otherwise fall back to creator based logic
    if (partnerId && createdBy === partnerId) return "shared_partner";
    return "shared_you";
  }

  function groupByBucket(items: CompletionRow[]) {
    const buckets: Record<BucketKey, CompletionRow[]> = {
      solo: [],
      shared_you: [],
      shared_both: [],
      shared_partner: [],
    };

    for (const c of items) {
      const b = classifyCompletion(c);
      buckets[b].push(c);
    }

    // newest first in each bucket
    (Object.keys(buckets) as BucketKey[]).forEach((k) => {
      buckets[k].sort((a, b) => (a.completed_at > b.completed_at ? -1 : 1));
    });

    return buckets;
  }

  // Calendar: per day, compute bucket covers + counts
  const dayBucketMeta = useMemo(() => {
    const meta = new Map<
      string,
      Record<
        BucketKey,
        {
          count: number;
          coverPath: string | null;
          coverUrl: string | null;
        }
      >
    >();

    for (const [dayKey, items] of completionsByDayKey.entries()) {
      const buckets = groupByBucket(items);

      const toMeta = (arr: CompletionRow[]) => {
        const cover = arr.find((x) => x.photo_path)?.photo_path ?? null;
        const coverUrl = cover ? photoUrls[cover] ?? null : null;
        return { count: arr.length, coverPath: cover, coverUrl };
      };

      meta.set(dayKey, {
        solo: toMeta(buckets.solo),
        shared_you: toMeta(buckets.shared_you),
        shared_both: toMeta(buckets.shared_both),
        shared_partner: toMeta(buckets.shared_partner),
      });
    }

    return meta;
  }, [completionsByDayKey, photoUrls]);

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
                  objectFit: "contain", // <-- no distortion
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
            <div style={{ opacity: 0.8, marginTop: 6 }}>
              Logged in as <b>{sessionEmail}</b>
            </div>
            {partnerId ? (
              <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>
                Partner linked ✅
              </div>
            ) : (
              <div style={{ opacity: 0.7, marginTop: 4, fontSize: 13 }}>
                Partner not linked (showing solo only)
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

          {/* Legend */}
          <div
            style={{
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
              opacity: 0.85,
              fontSize: 12,
              marginBottom: 10,
              fontWeight: 900,
            }}
          >
            <span>Legend:</span>
            <span>S = Solo</span>
            <span>Y = Shared (Yours)</span>
            <span>B = Shared (Both)</span>
            <span>P = Shared (Partner)</span>
          </div>

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
              const meta = dayBucketMeta.get(cell.key);

              const isToday =
                cell.key ===
                `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

              const total =
                (meta?.solo.count ?? 0) +
                (meta?.shared_you.count ?? 0) +
                (meta?.shared_both.count ?? 0) +
                (meta?.shared_partner.count ?? 0);

              // We also keep a “background cover” just like you had (first found photo of any bucket)
              const bgCoverUrl =
                meta?.solo.coverUrl ??
                meta?.shared_you.coverUrl ??
                meta?.shared_both.coverUrl ??
                meta?.shared_partner.coverUrl ??
                null;

              function laneBox(label: string, coverUrl: string | null, count: number) {
                return (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      alignItems: "stretch",
                    }}
                  >
                    <div style={{ fontSize: 10, fontWeight: 900, opacity: 0.95 }}>
                      {label}
                    </div>
                    <div
                      style={{
                        height: 34,
                        borderRadius: 10,
                        overflow: "hidden",
                        border: "1px solid rgba(255,255,255,0.18)",
                        background: "rgba(0,0,0,0.30)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt="Proof"
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 900, opacity: 0.8 }}>
                          {count ? `${count}` : "—"}
                        </span>
                      )}
                    </div>
                  </div>
                );
              }

              return (
                <button
                  key={cell.key}
                  type="button"
                  onClick={() => jumpToDay(cell.key)}
                  style={{
                    position: "relative",
                    height: 118,
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
                  title={total ? `${total} completion(s) — click to jump` : "No completions"}
                >
                  {bgCoverUrl ? (
                    <img
                      src={bgCoverUrl}
                      alt="Proof"
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: 0.55,
                      }}
                    />
                  ) : null}

                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      background: bgCoverUrl
                        ? "linear-gradient(to top, rgba(0,0,0,0.68), rgba(0,0,0,0.12))"
                        : "transparent",
                    }}
                  />

                  <div
                    style={{
                      position: "absolute",
                      top: 8,
                      left: 10,
                      fontWeight: 900,
                      fontSize: 13,
                      textShadow: bgCoverUrl ? "0 1px 8px rgba(0,0,0,0.45)" : "",
                      opacity: 0.95,
                    }}
                  >
                    {cell.date.getDate()}
                  </div>

                  {/* Lanes */}
                  <div
                    style={{
                      position: "absolute",
                      left: 10,
                      right: 10,
                      bottom: 10,
                      display: "grid",
                      gridTemplateColumns: "repeat(4, 1fr)",
                      gap: 8,
                    }}
                  >
                    {laneBox("S", meta?.solo.coverUrl ?? null, meta?.solo.count ?? 0)}
                    {laneBox("Y", meta?.shared_you.coverUrl ?? null, meta?.shared_you.count ?? 0)}
                    {laneBox("B", meta?.shared_both.coverUrl ?? null, meta?.shared_both.count ?? 0)}
                    {laneBox(
                      "P",
                      meta?.shared_partner.coverUrl ?? null,
                      meta?.shared_partner.count ?? 0
                    )}
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
              {dayGroups.map((g) => {
                const buckets = groupByBucket(g.items);

                function renderBucket(bucketKey: BucketKey) {
                  const items = buckets[bucketKey];
                  if (items.length === 0) return null;

                  return (
                    <div style={{ marginTop: 12 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "baseline",
                        }}
                      >
                        <div style={{ fontWeight: 900, fontSize: 14 }}>
                          {bucketLabel(bucketKey)}
                        </div>
                        <div style={{ opacity: 0.8, fontSize: 13 }}>
                          {items.length} item(s)
                        </div>
                      </div>

                      <div style={{ height: 10 }} />

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                        {items.map((c) => {
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
                                <div
                                  style={{
                                    opacity: 0.75,
                                    fontSize: 12,
                                    marginTop: 6,
                                  }}
                                >
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
                  );
                }

                return (
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

                    {/* Buckets */}
                    {renderBucket("solo")}
                    {renderBucket("shared_you")}
                    {renderBucket("shared_both")}
                    {renderBucket("shared_partner")}
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
