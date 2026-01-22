"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { theme } from "@/UI/theme";

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
  scheduled_days: number[] | null;
  weekly_skips_allowed: number;
  is_shared?: boolean;
  assigned_to?: string | null;
};

type CompletionRow = {
  id: string;
  user_id: string;
  task_id: string;
  completed_at: string;
};

type PartnershipRow = { owner_id: string; partner_id: string };
type PartnerProfile = { user_id: string; display_name: string | null; email: string | null };

/* ---------- colors / icons ---------- */

type TaskColor = { bg: string; text: "#000" | "#fff" };

const TASK_COLORS: TaskColor[] = [
  { bg: "#F59E0B", text: "#000" },
  { bg: "#3B82F6", text: "#fff" },
  { bg: "#22C55E", text: "#000" },
  { bg: "#EF4444", text: "#fff" },
  { bg: "#A855F7", text: "#fff" },
  { bg: "#06B6D4", text: "#000" },
  { bg: "#F97316", text: "#000" },
  { bg: "#84CC16", text: "#000" },
  { bg: "#0EA5E9", text: "#000" },
  { bg: "#111827", text: "#fff" },
];

function colorIndexFromId(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % TASK_COLORS.length;
}

type IconKind = "water" | "lift" | "run" | "calendar" | "check";

function pickIconKind(title: string): IconKind {
  const t = title.toLowerCase();
  if (t.includes("water") || t.includes("hydrate")) return "water";
  if (t.includes("lift") || t.includes("gym") || t.includes("bench") || t.includes("squat")) return "lift";
  if (t.includes("run") || t.includes("walk") || t.includes("steps")) return "run";
  if (t.includes("calendar") || t.includes("schedule")) return "calendar";
  return "check";
}

function MiniIcon({ kind }: { kind: IconKind }) {
  // Keeping your placeholder icon style (don’t change visuals)
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <circle cx="12" cy="12" r="9" opacity="0.9" />
    </svg>
  );
}

/* ---------- page ---------- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 14, marginBottom: 8, fontWeight: 950, fontSize: 14, opacity: 0.9 }}>
      {children}
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "4px 8px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.22)",
        background: "rgba(0,0,0,0.12)",
        fontSize: 11,
        fontWeight: 950,
        letterSpacing: 0.2,
        opacity: 0.95,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function sameArray(a: number[] | null, b: number[] | null) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;
  const aa = [...a].sort((x, y) => x - y);
  const bb = [...b].sort((x, y) => x - y);
  for (let i = 0; i < aa.length; i++) if (aa[i] !== bb[i]) return false;
  return true;
}

// Signature to detect “Both” pairs (two rows that are identical except assigned_to/id).
function sharedSignature(t: TaskRow) {
  return JSON.stringify({
    title: (t.title ?? "").trim().toLowerCase(),
    type: t.type,
    freq_times: t.freq_times ?? null,
    freq_per: t.freq_per ?? null,
    weekly_skips_allowed: t.weekly_skips_allowed ?? 0,
    scheduled_days: t.scheduled_days ? [...t.scheduled_days].sort((a, b) => a - b) : null,
    // created_at intentionally NOT included (so “Both” still groups even if insert order differs slightly)
    // If you later add a group_id, use that instead.
  });
}

export default function TasksPage() {
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [partnerLabel, setPartnerLabel] = useState<string>("Partner");

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);

  useEffect(() => {
    let alive = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setUserId(data.session?.user?.id ?? null);
    });

    return () => {
      alive = false;
    };
  }, []);

  // Load partner link + label (best effort)
  useEffect(() => {
    if (!userId) return;

    let alive = true;

    (async () => {
      try {
        const { data: links, error } = await supabase
          .from("partnerships")
          .select("owner_id, partner_id")
          .or(`owner_id.eq.${userId},partner_id.eq.${userId}`)
          .limit(1);

        if (!alive) return;
        if (error || !links?.length) {
          setPartnerId(null);
          setPartnerLabel("Partner");
          return;
        }

        const link = links[0] as PartnershipRow;
        const otherId = link.owner_id === userId ? link.partner_id : link.owner_id;

        setPartnerId(otherId);

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, email")
          .eq("user_id", otherId)
          .maybeSingle();

        if (!alive) return;
        if (profErr || !prof) {
          setPartnerLabel("Partner");
          return;
        }

        const p = prof as PartnerProfile;
        setPartnerLabel(p.display_name ?? p.email ?? "Partner");
      } catch {
        if (!alive) return;
        setPartnerId(null);
        setPartnerLabel("Partner");
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    let alive = true;

    (async () => {
      setLoading(true);

      const { data: tData } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (!alive) return;
      setTasks((tData ?? []) as TaskRow[]);

      const { data: cData } = await supabase
        .from("completions")
        .select("id,task_id,completed_at")
        .eq("user_id", userId);

      if (!alive) return;
      setCompletions((cData ?? []) as CompletionRow[]);

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  const completionMap = useMemo(() => {
    const m = new Map<string, number>();
    completions.forEach((c) => {
      m.set(c.task_id, (m.get(c.task_id) ?? 0) + 1);
    });
    return m;
  }, [completions]);

  const activeTasks = tasks.filter((t) => !t.archived);
  const archivedTasks = tasks.filter((t) => t.archived);

  // ✅ Split SOLO vs SHARED
  const soloActive = activeTasks.filter((t) => !t.is_shared);
  const sharedActiveRaw = activeTasks.filter((t) => !!t.is_shared);

  // ✅ Further split shared into Me / Partner / Both (for now, for testing)
  const sharedGroups = useMemo(() => {
    const groups = new Map<
      string,
      { sig: string; rows: TaskRow[]; hasMe: boolean; hasPartner: boolean }
    >();

    for (const t of sharedActiveRaw) {
      const sig = sharedSignature(t);
      const g = groups.get(sig) ?? { sig, rows: [], hasMe: false, hasPartner: false };
      g.rows.push(t);
      if (userId && t.assigned_to === userId) g.hasMe = true;
      if (partnerId && t.assigned_to === partnerId) g.hasPartner = true;
      groups.set(sig, g);
    }

    const both: TaskRow[] = [];
    const me: TaskRow[] = [];
    const partner: TaskRow[] = [];

    // Put newest-ish first: use the newest created_at inside group for sorting
    const groupList = Array.from(groups.values()).sort((a, b) => {
      const aMax = Math.max(...a.rows.map((r) => new Date(r.created_at).getTime()));
      const bMax = Math.max(...b.rows.map((r) => new Date(r.created_at).getTime()));
      return bMax - aMax;
    });

    for (const g of groupList) {
      // BOTH: has both assignees present (one row each)
      if (g.hasMe && g.hasPartner) {
        // represent the group with the “me” row if possible (so Edit opens the one you can see/own)
        const pick = g.rows.find((r) => userId && r.assigned_to === userId) ?? g.rows[0];
        both.push(pick);
        continue;
      }

      // ME only
      if (g.hasMe) {
        const pick = g.rows.find((r) => userId && r.assigned_to === userId) ?? g.rows[0];
        me.push(pick);
        continue;
      }

      // PARTNER only (task assigned to partner but owned by me for now)
      if (g.hasPartner) {
        const pick = g.rows.find((r) => partnerId && r.assigned_to === partnerId) ?? g.rows[0];
        partner.push(pick);
        continue;
      }

      // Fallback: unknown assignee, treat as me bucket so it doesn’t vanish
      me.push(g.rows[0]);
    }

    return { both, me, partner };
  }, [sharedActiveRaw, userId, partnerId]);

  function renderTaskCard(t: TaskRow, label?: React.ReactNode) {
    const { bg, text } = TASK_COLORS[colorIndexFromId(t.id)];
    const done = completionMap.get(t.id) ?? 0;
    const target = t.type === "habit" ? t.freq_times ?? 1 : 1;
    const pct = Math.min(1, done / target);

    return (
      <div
        key={t.id}
        style={{
          background: bg,
          color: text,
          borderRadius: 18,
          padding: "11px 12px",
          boxShadow: "0 10px 22px rgba(0,0,0,0.45)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <MiniIcon kind={pickIconKind(t.title)} />
          <div style={{ flex: 1, fontWeight: 900, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{t.title}</span>
            {label ? <Pill>{label}</Pill> : null}
          </div>

          <button onClick={() => router.push(`/tasks/create?id=${t.id}`)}>Edit</button>
        </div>

        <div
          style={{
            marginTop: 9,
            height: 9,
            borderRadius: 999,
            background: "rgba(0,0,0,0.2)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${Math.round(pct * 100)}%`,
              background: "rgba(0,0,0,0.45)",
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        padding: 24,
        paddingBottom: 110,
      }}
    >
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Tasks</h1>
          <Link href="/shared">Shared</Link>
        </div>

        <div style={{ height: 16 }} />

        {loading ? (
          <div>Loading…</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* ✅ SOLO SECTION */}
            <SectionTitle>Solo</SectionTitle>
            {soloActive.length === 0 ? (
              <div style={{ opacity: 0.7, padding: "6px 2px" }}>No solo tasks yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {soloActive.map((t) => renderTaskCard(t, "Solo"))}
              </div>
            )}

            {/* ✅ SHARED SECTION */}
            <SectionTitle>Shared</SectionTitle>

            {/* Shared • Both */}
            <div style={{ marginTop: 6 }}>
              <div style={{ fontWeight: 950, fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                Both
              </div>
              {sharedGroups.both.length === 0 ? (
                <div style={{ opacity: 0.7, padding: "6px 2px" }}>No “Both” shared tasks yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sharedGroups.both.map((t) => renderTaskCard(t, "Shared • Both"))}
                </div>
              )}
            </div>

            {/* Shared • Me */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 950, fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                Me
              </div>
              {sharedGroups.me.length === 0 ? (
                <div style={{ opacity: 0.7, padding: "6px 2px" }}>No shared tasks assigned to you yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sharedGroups.me.map((t) => renderTaskCard(t, "Shared • Me"))}
                </div>
              )}
            </div>

            {/* Shared • Partner */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 950, fontSize: 13, opacity: 0.85, marginBottom: 8 }}>
                {partnerId ? partnerLabel : "Partner"}
              </div>
              {sharedGroups.partner.length === 0 ? (
                <div style={{ opacity: 0.7, padding: "6px 2px" }}>
                  No shared tasks assigned to {partnerId ? partnerLabel : "your partner"} yet.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {sharedGroups.partner.map((t) =>
                    renderTaskCard(t, partnerId ? `Shared • ${partnerLabel}` : "Shared • Partner")
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ✅ BIG PLUS CREATE BUTTON */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 22 }}>
          <button
            onClick={() => router.push("/tasks/create")}
            aria-label="Create task"
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              background: theme.accent.primary,
              border: `2px solid ${theme.accent.primary}`,
              fontSize: 38,
              fontWeight: 900,
              cursor: "pointer",
              boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
            }}
          >
            +
          </button>
        </div>

        {archivedTasks.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3>Archived</h3>
            {archivedTasks.map((t) => (
              <div key={t.id}>{t.title}</div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
