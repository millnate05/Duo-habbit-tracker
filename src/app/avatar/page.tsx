// FORCE NEW COMMIT: 2026-01-06-AVATAR-V1
"use client";

import React, { useEffect, useMemo, useState } from "react";
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
  scheduled_days?: number[] | null; // 0 Sun ... 6 Sat
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

type AvatarJson = {
  skinTone?: string; // hex
  hairStyle?: "short" | "medium" | "long" | "buzz";
  hairColor?: string; // hex
  eyeColor?: string; // hex
  outfit?: "tee" | "hoodie" | "tank";
};

const DEFAULT_AVATAR: Required<AvatarJson> = {
  skinTone: "#d1a17a",
  hairStyle: "short",
  hairColor: "#1f2937",
  eyeColor: "#2563eb",
  outfit: "hoodie",
};

// ---------- Local date helpers ----------
function startOfDayLocal(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}
function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function isTaskScheduledOn(task: TaskRow, date: Date) {
  const days = task.scheduled_days ?? null;
  if (!days || days.length === 0) return true;
  return days.includes(date.getDay());
}

function requiredForDay(task: TaskRow, date: Date) {
  // For avatar scoring, we only care about "what was due that day".
  // V1 rule:
  // - daily habits are due on their scheduled days (or every day if no schedule)
  // - weekly/monthly/yearly habits do NOT count toward daily score (keeps this simple & stable)
  // - single tasks do not count toward daily score
  if (task.type !== "habit") return 0;
  const per = (task.freq_per ?? "week") as FrequencyUnit;
  if (per !== "day") return 0;
  if (!isTaskScheduledOn(task, date)) return 0;
  return Math.max(1, Number(task.freq_times ?? 1));
}

function countDoneForTaskOnDay(taskId: string, dayStart: Date, completions: CompletionRow[]) {
  const start = dayStart.getTime();
  const end = addDays(dayStart, 1).getTime();
  let c = 0;
  for (const row of completions) {
    const ts = new Date(row.completed_at).getTime();
    if (ts >= start && ts < end && row.task_id === taskId) c++;
  }
  return c;
}

// Completion smoothing: more history => slower movement
function smoothScoreFromDailyRates(rates: number[], daysTracked: number) {
  // rates are 0..1, latest last
  // half-life grows with daysTracked (cap it so it doesn't get absurd)
  const halfLife = clamp(3 + Math.floor(daysTracked / 7), 3, 21); // 3..21 days
  const alpha = 1 - Math.pow(0.5, 1 / halfLife); // EMA alpha

  let ema = rates.length ? rates[0] : 0.5;
  for (let i = 1; i < rates.length; i++) {
    ema = alpha * rates[i] + (1 - alpha) * ema;
  }
  return clamp(ema * 100, 0, 100); // 0..100
}

function conditionFromScore(score: number) {
  // <50 => worse, >=50 => better
  // V1 tiers
  if (score < 25) return { tier: "bad", acne: 0.9, chub: 0.9, glow: 0.0 };
  if (score < 50) return { tier: "meh", acne: 0.5, chub: 0.5, glow: 0.0 };
  if (score < 75) return { tier: "good", acne: 0.15, chub: 0.1, glow: 0.35 };
  return { tier: "great", acne: 0.0, chub: 0.0, glow: 0.65 };
}

function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export default function AvatarPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);

  const [avatar, setAvatar] = useState<Required<AvatarJson>>(DEFAULT_AVATAR);

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [completions, setCompletions] = useState<CompletionRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Auth
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

  async function loadAvatar(uid: string) {
    setLoading(true);
    setStatus(null);

    try {
      // 1) profile avatar_json
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("avatar_json")
        .eq("user_id", uid)
        .single();

      if (profErr) throw profErr;

      const loaded = (prof?.avatar_json ?? {}) as AvatarJson;
      setAvatar({ ...DEFAULT_AVATAR, ...loaded });

      // 2) tasks
      const { data: tasksData, error: tasksErr } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", uid)
        .eq("archived", false)
        .order("created_at", { ascending: false });

      if (tasksErr) throw tasksErr;
      setTasks((tasksData ?? []) as TaskRow[]);

      // 3) completions (last ~60 days is plenty for “history-based smoothing” in V1)
      const now = new Date();
      const earliest = startOfDayLocal(now);
      earliest.setDate(earliest.getDate() - 59);

      const { data: compData, error: compErr } = await supabase
        .from("completions")
        .select("*")
        .eq("user_id", uid)
        .gte("completed_at", earliest.toISOString())
        .order("completed_at", { ascending: true }) // ascending helps day-by-day calcs
        .limit(8000);

      if (compErr) throw compErr;
      setCompletions((compData ?? []) as CompletionRow[]);
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to load avatar.");
      setTasks([]);
      setCompletions([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    loadAvatar(userId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function saveAvatar() {
    if (!userId) return;
    setBusy(true);
    setStatus(null);

    try {
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_json: avatar })
        .eq("user_id", userId);

      if (error) throw error;
      setStatus("Saved ✅");
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Failed to save.");
    } finally {
      setBusy(false);
    }
  }

  // ---------- Score computation (V1) ----------
  const now = useMemo(() => new Date(), []);
  const dailyScore = useMemo(() => {
    // Build daily completion rates for last 14 days based on DAILY tasks only.
    // This avoids weekly frequency confusion and matches your “day-by-day avatar change” vibe.
    const todayStart = startOfDayLocal(new Date());
    const days: Date[] = [];
    for (let i = 13; i >= 0; i--) days.push(addDays(todayStart, -i));

    const rates: number[] = [];
    for (const day of days) {
      let required = 0;
      let done = 0;

      for (const t of tasks) {
        const req = requiredForDay(t, day);
        if (req <= 0) continue;
        required += req;
        done += Math.min(req, countDoneForTaskOnDay(t.id, startOfDayLocal(day), completions));
      }

      const rate = required > 0 ? done / required : 1; // if nothing due, treat as perfect
      rates.push(clamp(rate, 0, 1));
    }

    // daysTracked for smoothing: count days with any due daily tasks in last 60 days-ish
    // (simple proxy: how many days in this 14-day window had required > 0)
    let tracked = 0;
    for (let i = 0; i < 14; i++) {
      const day = days[i];
      let req = 0;
      for (const t of tasks) req += requiredForDay(t, day);
      if (req > 0) tracked++;
    }

    const score = smoothScoreFromDailyRates(rates, tracked);
    return { score, rates, tracked };
  }, [tasks, completions]);

  const condition = useMemo(() => conditionFromScore(dailyScore.score), [dailyScore.score]);

  // ---------- UI ----------
  if (!userId) {
    return (
      <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Avatar</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>Log in to customize your avatar.</p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${theme.accent.primary}`, color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Home
            </Link>
            <Link href="/profile" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Log in
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
      <div style={{ maxWidth: 980, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Avatar</h1>
            <div style={{ opacity: 0.85, marginTop: 6 }}>
              Logged in as <b>{sessionEmail}</b> • {dayLabel(new Date())}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={{ padding: "10px 12px", borderRadius: 12, border: `1px solid ${theme.accent.primary}`, color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Home
            </Link>
            <Link href="/tasks" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Tasks
            </Link>
            <Link href="/stats" style={{ padding: "10px 12px", borderRadius: 12, border: "1px solid var(--border)", color: "var(--text)", textDecoration: "none", fontWeight: 900 }}>
              Stats
            </Link>
          </div>
        </div>

        {status ? (
          <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}>
            {status}
          </div>
        ) : null}

        <section style={{ border: "1px solid var(--border)", borderRadius: 16, padding: 16, background: "rgba(255,255,255,0.02)", boxShadow: "0 10px 24px rgba(0,0,0,0.20)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 900 }}>Condition</div>
              <div style={{ opacity: 0.8, marginTop: 4 }}>
                Score: <b>{Math.round(dailyScore.score)}%</b> • Tier: <b>{condition.tier}</b> • (More history = slower changes)
              </div>
            </div>

            <button
              onClick={saveAvatar}
              disabled={busy}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${theme.accent.primary}`,
                background: "transparent",
                color: "var(--text)",
                fontWeight: 900,
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.7 : 1,
              }}
              type="button"
            >
              Save Avatar
            </button>
          </div>

          <div style={{ height: 14 }} />

          <div style={{ display: "grid", gridTemplateColumns: "minmax(260px, 1fr) minmax(260px, 1fr)", gap: 14 }}>
            {/* Preview */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Preview</div>
              <AvatarPreview avatar={avatar} condition={condition} />
              <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                V1 preview is “simple shapes” — later we can swap in a real avatar renderer with clothing catalogs.
              </div>
            </div>

            {/* Controls */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Customize</div>

              {loading ? (
                <div style={{ border: "1px dashed var(--border)", borderRadius: 14, padding: 12, opacity: 0.85 }}>
                  Loading…
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <Field label="Skin tone">
                    <input
                      type="color"
                      value={avatar.skinTone}
                      onChange={(e) => setAvatar((p) => ({ ...p, skinTone: e.target.value }))}
                      style={{ width: 54, height: 38, border: "1px solid var(--border)", borderRadius: 10, background: "transparent" }}
                    />
                  </Field>

                  <Field label="Hair style">
                    <select
                      value={avatar.hairStyle}
                      onChange={(e) => setAvatar((p) => ({ ...p, hairStyle: e.target.value as any }))}
                      style={selectStyle}
                    >
                      <option value="buzz">Buzz</option>
                      <option value="short">Short</option>
                      <option value="medium">Medium</option>
                      <option value="long">Long</option>
                    </select>
                  </Field>

                  <Field label="Hair color">
                    <input
                      type="color"
                      value={avatar.hairColor}
                      onChange={(e) => setAvatar((p) => ({ ...p, hairColor: e.target.value }))}
                      style={{ width: 54, height: 38, border: "1px solid var(--border)", borderRadius: 10, background: "transparent" }}
                    />
                  </Field>

                  <Field label="Eye color">
                    <input
                      type="color"
                      value={avatar.eyeColor}
                      onChange={(e) => setAvatar((p) => ({ ...p, eyeColor: e.target.value }))}
                      style={{ width: 54, height: 38, border: "1px solid var(--border)", borderRadius: 10, background: "transparent" }}
                    />
                  </Field>

                  <Field label="Outfit">
                    <select
                      value={avatar.outfit}
                      onChange={(e) => setAvatar((p) => ({ ...p, outfit: e.target.value as any }))}
                      style={selectStyle}
                    >
                      <option value="hoodie">Hoodie</option>
                      <option value="tee">T-Shirt</option>
                      <option value="tank">Tank</option>
                    </select>
                  </Field>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setAvatar(DEFAULT_AVATAR)}
                      disabled={busy}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 12,
                        border: "1px solid var(--border)",
                        background: "transparent",
                        color: "var(--text)",
                        fontWeight: 900,
                        cursor: busy ? "not-allowed" : "pointer",
                        opacity: busy ? 0.7 : 1,
                      }}
                    >
                      Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div style={{ opacity: 0.85, fontWeight: 900 }}>{label}</div>
      {children}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  background: "transparent",
  color: "var(--text)",
  fontWeight: 900,
  outline: "none",
  minWidth: 170,
};

function AvatarPreview({
  avatar,
  condition,
}: {
  avatar: Required<AvatarJson>;
  condition: { tier: string; acne: number; chub: number; glow: number };
}) {
  // Simple SVG “paper doll” avatar.
  // Condition overlays:
  // - acne: red dots on face
  // - chub: increases face width subtly
  // - glow: adds a soft halo / highlight
  const faceW = 120 + condition.chub * 22;
  const faceH = 140 + condition.chub * 12;

  const hair = (() => {
    switch (avatar.hairStyle) {
      case "buzz":
        return <rect x={90} y={45} width={140} height={50} rx={24} fill={avatar.hairColor} opacity={0.9} />;
      case "short":
        return <path d="M95 85 C110 40, 210 40, 225 85 C215 75, 105 75, 95 85 Z" fill={avatar.hairColor} />;
      case "medium":
        return <path d="M85 95 C100 30, 220 30, 235 95 C230 150, 90 150, 85 95 Z" fill={avatar.hairColor} />;
      case "long":
        return <path d="M75 105 C95 25, 225 25, 245 105 C250 210, 70 210, 75 105 Z" fill={avatar.hairColor} />;
    }
  })();

  const outfit = (() => {
    switch (avatar.outfit) {
      case "hoodie":
        return (
          <>
            <path d="M95 260 C115 230, 205 230, 225 260 L240 330 L80 330 Z" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.16)" />
            <path d="M120 255 C140 235, 180 235, 200 255" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={6} strokeLinecap="round" />
          </>
        );
      case "tee":
        return <path d="M90 260 L240 260 L260 330 L70 330 Z" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.16)" />;
      case "tank":
        return (
          <>
            <path d="M110 260 L220 260 L240 330 L90 330 Z" fill="rgba(255,255,255,0.10)" stroke="rgba(255,255,255,0.16)" />
            <path d="M110 260 C120 245, 135 240, 150 255" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={6} />
            <path d="M220 260 C210 245, 195 240, 180 255" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={6} />
          </>
        );
    }
  })();

  const acneDots = [];
  const acneCount = Math.round(condition.acne * 14);
  for (let i = 0; i < acneCount; i++) {
    const x = 150 + ((i * 17) % 60) - 30;
    const y = 150 + ((i * 23) % 50) - 25;
    acneDots.push(<circle key={i} cx={x} cy={y} r={3} fill="rgba(239,68,68,0.75)" />);
  }

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg width="320" height="360" viewBox="0 0 320 360" style={{ borderRadius: 14, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)" }}>
        {/* glow */}
        {condition.glow > 0 ? (
          <circle cx="160" cy="150" r="120" fill="rgba(245,158,11,0.15)" opacity={condition.glow} />
        ) : null}

        {/* hair */}
        {hair}

        {/* face */}
        <ellipse cx="160" cy="160" rx={faceW / 2} ry={faceH / 2} fill={avatar.skinTone} />

        {/* eyes */}
        <circle cx="135" cy="155" r="10" fill="rgba(0,0,0,0.35)" />
        <circle cx="185" cy="155" r="10" fill="rgba(0,0,0,0.35)" />
        <circle cx="135" cy="155" r="6" fill={avatar.eyeColor} />
        <circle cx="185" cy="155" r="6" fill={avatar.eyeColor} />

        {/* mouth */}
        <path d="M140 205 C155 220, 165 220, 180 205" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={6} strokeLinecap="round" />

        {/* acne overlay */}
        {acneDots}

        {/* body */}
        {outfit}
      </svg>
    </div>
  );
}
