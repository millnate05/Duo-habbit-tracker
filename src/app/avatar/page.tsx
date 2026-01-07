// FORCE NEW COMMIT: 2026-01-06-AVATAR-V2-FULLBODY
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

/** Avatar schema stored in profiles.avatar_json */
type AvatarJson = {
  // body
  bodyType?: "slim" | "average" | "buff" | "chubby";
  height?: "short" | "average" | "tall";

  // face/head
  skinTone?: string; // hex
  faceShape?: "oval" | "round" | "square";
  eyeShape?: "round" | "almond";
  eyeColor?: string; // hex
  browStyle?: "thin" | "medium" | "thick";
  mouthStyle?: "smile" | "neutral" | "grin";

  // hair
  hairStyle?: "buzz" | "short" | "medium" | "long" | "curly";
  hairColor?: string; // hex

  // facial hair
  facialHair?: "none" | "stubble" | "beard";

  // clothing
  top?: "hoodie" | "tee" | "tank" | "longsleeve";
  bottom?: "shorts" | "jeans" | "joggers";
  shoes?: "sneakers" | "slides";

  // colors
  outfitPrimary?: string; // hex
  outfitSecondary?: string; // hex

  // accessories
  glasses?: "none" | "round" | "square";
  hat?: "none" | "cap" | "beanie";
};

const DEFAULT_AVATAR: Required<AvatarJson> = {
  bodyType: "average",
  height: "average",

  skinTone: "#d1a17a",
  faceShape: "oval",
  eyeShape: "almond",
  eyeColor: "#2563eb",
  browStyle: "medium",
  mouthStyle: "smile",

  hairStyle: "short",
  hairColor: "#1f2937",

  facialHair: "none",

  top: "hoodie",
  bottom: "joggers",
  shoes: "sneakers",

  outfitPrimary: "#111827",
  outfitSecondary: "#374151",

  glasses: "none",
  hat: "none",
};

// ---------- Date helpers ----------
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
function dayLabel(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function isTaskScheduledOn(task: TaskRow, date: Date) {
  const days = task.scheduled_days ?? null;
  if (!days || days.length === 0) return true;
  return days.includes(date.getDay());
}

function requiredForDay(task: TaskRow, date: Date) {
  // V2 scoring still uses DAILY tasks only (simple + predictable)
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
    if (row.task_id !== taskId) continue;
    const ts = new Date(row.completed_at).getTime();
    if (ts >= start && ts < end) c++;
  }
  return c;
}

// Completion smoothing: more history => slower movement
function smoothScoreFromDailyRates(rates: number[], daysTracked: number) {
  const halfLife = clamp(3 + Math.floor(daysTracked / 7), 3, 21); // 3..21 days
  const alpha = 1 - Math.pow(0.5, 1 / halfLife); // EMA alpha

  let ema = rates.length ? rates[0] : 0.5;
  for (let i = 1; i < rates.length; i++) {
    ema = alpha * rates[i] + (1 - alpha) * ema;
  }
  return clamp(ema * 100, 0, 100);
}

function conditionFromScore(score: number) {
  // <50 => worse, >=50 => better
  if (score < 25) return { tier: "bad", acne: 0.95, softness: 0.95, glow: 0.0 };
  if (score < 50) return { tier: "meh", acne: 0.55, softness: 0.55, glow: 0.0 };
  if (score < 75) return { tier: "good", acne: 0.18, softness: 0.15, glow: 0.35 };
  return { tier: "great", acne: 0.0, softness: 0.0, glow: 0.65 };
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
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("avatar_json")
        .eq("user_id", uid)
        .single();

      if (profErr) throw profErr;

      const loaded = (prof?.avatar_json ?? {}) as AvatarJson;
      setAvatar({ ...DEFAULT_AVATAR, ...loaded });

      const { data: tasksData, error: tasksErr } = await supabase
        .from("tasks")
        .select("*")
        .eq("user_id", uid)
        .eq("archived", false)
        .order("created_at", { ascending: false });

      if (tasksErr) throw tasksErr;
      setTasks((tasksData ?? []) as TaskRow[]);

      const now = new Date();
      const earliest = startOfDayLocal(now);
      earliest.setDate(earliest.getDate() - 59);

      const { data: compData, error: compErr } = await supabase
        .from("completions")
        .select("*")
        .eq("user_id", uid)
        .gte("completed_at", earliest.toISOString())
        .order("completed_at", { ascending: true })
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

  // Score (daily tasks only)
  const dailyScore = useMemo(() => {
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

      const rate = required > 0 ? done / required : 1;
      rates.push(clamp(rate, 0, 1));
    }

    let tracked = 0;
    for (const day of days) {
      let req = 0;
      for (const t of tasks) req += requiredForDay(t, day);
      if (req > 0) tracked++;
    }

    const score = smoothScoreFromDailyRates(rates, tracked);
    return { score, tracked };
  }, [tasks, completions]);

  const condition = useMemo(() => conditionFromScore(dailyScore.score), [dailyScore.score]);

  // Logged out
  if (!userId) {
    return (
      <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Avatar</h1>
          <p style={{ marginTop: 8, opacity: 0.8 }}>Log in to customize your avatar.</p>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={linkPrimary}>Home</Link>
            <Link href="/profile" style={linkSecondary}>Log in</Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: theme.layout.fullHeight, background: theme.page.background, color: theme.page.text, padding: 24 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 34, fontWeight: 900 }}>Avatar</h1>
            <div style={{ opacity: 0.85, marginTop: 6 }}>
              Logged in as <b>{sessionEmail}</b> • {dayLabel(new Date())}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/" style={linkPrimary}>Home</Link>
            <Link href="/tasks" style={linkSecondary}>Tasks</Link>
            <Link href="/stats" style={linkSecondary}>Stats</Link>
            <button onClick={saveAvatar} disabled={busy} style={buttonPrimary(busy)}>
              Save Avatar
            </button>
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
                Score: <b>{Math.round(dailyScore.score)}%</b> • Tier: <b>{condition.tier}</b> • History days (in window): <b>{dailyScore.tracked}</b>
              </div>
            </div>
          </div>

          <div style={{ height: 14 }} />

          <div style={{ display: "grid", gridTemplateColumns: "minmax(320px, 1fr) minmax(340px, 1fr)", gap: 14 }}>
            {/* Preview */}
            <div style={{ border: "1px solid var(--border)", borderRadius: 14, padding: 12 }}>
              <div style={{ fontWeight: 900, marginBottom: 10 }}>Full-body Preview</div>
              <AvatarFullBody avatar={avatar} condition={condition} />
              <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
                This is V2 SVG-based. Next step is swapping to a real “catalog” renderer (Snap/Bitmoji style) while keeping the same avatar_json schema.
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {/* Body */}
                  <Field label="Body type">
                    <select value={avatar.bodyType} onChange={(e) => setAvatar((p) => ({ ...p, bodyType: e.target.value as any }))} style={selectStyle}>
                      <option value="slim">Slim</option>
                      <option value="average">Average</option>
                      <option value="buff">Buff</option>
                      <option value="chubby">Chubby</option>
                    </select>
                  </Field>

                  <Field label="Height">
                    <select value={avatar.height} onChange={(e) => setAvatar((p) => ({ ...p, height: e.target.value as any }))} style={selectStyle}>
                      <option value="short">Short</option>
                      <option value="average">Average</option>
                      <option value="tall">Tall</option>
                    </select>
                  </Field>

                  {/* Face */}
                  <Field label="Skin tone">
                    <input type="color" value={avatar.skinTone} onChange={(e) => setAvatar((p) => ({ ...p, skinTone: e.target.value }))} style={colorStyle} />
                  </Field>

                  <Field label="Face shape">
                    <select value={avatar.faceShape} onChange={(e) => setAvatar((p) => ({ ...p, faceShape: e.target.value as any }))} style={selectStyle}>
                      <option value="oval">Oval</option>
                      <option value="round">Round</option>
                      <option value="square">Square</option>
                    </select>
                  </Field>

                  <Field label="Eye shape">
                    <select value={avatar.eyeShape} onChange={(e) => setAvatar((p) => ({ ...p, eyeShape: e.target.value as any }))} style={selectStyle}>
                      <option value="almond">Almond</option>
                      <option value="round">Round</option>
                    </select>
                  </Field>

                  <Field label="Eye color">
                    <input type="color" value={avatar.eyeColor} onChange={(e) => setAvatar((p) => ({ ...p, eyeColor: e.target.value }))} style={colorStyle} />
                  </Field>

                  <Field label="Eyebrows">
                    <select value={avatar.browStyle} onChange={(e) => setAvatar((p) => ({ ...p, browStyle: e.target.value as any }))} style={selectStyle}>
                      <option value="thin">Thin</option>
                      <option value="medium">Medium</option>
                      <option value="thick">Thick</option>
                    </select>
                  </Field>

                  <Field label="Mouth">
                    <select value={avatar.mouthStyle} onChange={(e) => setAvatar((p) => ({ ...p, mouthStyle: e.target.value as any }))} style={selectStyle}>
                      <option value="smile">Smile</option>
                      <option value="neutral">Neutral</option>
                      <option value="grin">Grin</option>
                    </select>
                  </Field>

                  {/* Hair */}
                  <Field label="Hair style">
                    <select value={avatar.hairStyle} onChange={(e) => setAvatar((p) => ({ ...p, hairStyle: e.target.value as any }))} style={selectStyle}>
                      <option value="buzz">Buzz</option>
                      <option value="short">Short</option>
                      <option value="medium">Medium</option>
                      <option value="long">Long</option>
                      <option value="curly">Curly</option>
                    </select>
                  </Field>

                  <Field label="Hair color">
                    <input type="color" value={avatar.hairColor} onChange={(e) => setAvatar((p) => ({ ...p, hairColor: e.target.value }))} style={colorStyle} />
                  </Field>

                  {/* Facial hair */}
                  <Field label="Facial hair">
                    <select value={avatar.facialHair} onChange={(e) => setAvatar((p) => ({ ...p, facialHair: e.target.value as any }))} style={selectStyle}>
                      <option value="none">None</option>
                      <option value="stubble">Stubble</option>
                      <option value="beard">Beard</option>
                    </select>
                  </Field>

                  {/* Accessories */}
                  <Field label="Glasses">
                    <select value={avatar.glasses} onChange={(e) => setAvatar((p) => ({ ...p, glasses: e.target.value as any }))} style={selectStyle}>
                      <option value="none">None</option>
                      <option value="round">Round</option>
                      <option value="square">Square</option>
                    </select>
                  </Field>

                  <Field label="Hat">
                    <select value={avatar.hat} onChange={(e) => setAvatar((p) => ({ ...p, hat: e.target.value as any }))} style={selectStyle}>
                      <option value="none">None</option>
                      <option value="cap">Cap</option>
                      <option value="beanie">Beanie</option>
                    </select>
                  </Field>

                  {/* Outfit */}
                  <Field label="Top">
                    <select value={avatar.top} onChange={(e) => setAvatar((p) => ({ ...p, top: e.target.value as any }))} style={selectStyle}>
                      <option value="hoodie">Hoodie</option>
                      <option value="tee">T-Shirt</option>
                      <option value="tank">Tank</option>
                      <option value="longsleeve">Long sleeve</option>
                    </select>
                  </Field>

                  <Field label="Bottom">
                    <select value={avatar.bottom} onChange={(e) => setAvatar((p) => ({ ...p, bottom: e.target.value as any }))} style={selectStyle}>
                      <option value="joggers">Joggers</option>
                      <option value="jeans">Jeans</option>
                      <option value="shorts">Shorts</option>
                    </select>
                  </Field>

                  <Field label="Shoes">
                    <select value={avatar.shoes} onChange={(e) => setAvatar((p) => ({ ...p, shoes: e.target.value as any }))} style={selectStyle}>
                      <option value="sneakers">Sneakers</option>
                      <option value="slides">Slides</option>
                    </select>
                  </Field>

                  <Field label="Outfit primary">
                    <input type="color" value={avatar.outfitPrimary} onChange={(e) => setAvatar((p) => ({ ...p, outfitPrimary: e.target.value }))} style={colorStyle} />
                  </Field>

                  <Field label="Outfit secondary">
                    <input type="color" value={avatar.outfitSecondary} onChange={(e) => setAvatar((p) => ({ ...p, outfitSecondary: e.target.value }))} style={colorStyle} />
                  </Field>

                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => setAvatar(DEFAULT_AVATAR)}
                      disabled={busy}
                      style={buttonSecondary(busy)}
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

// ---------- Small UI helpers ----------
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ opacity: 0.85, fontWeight: 900, fontSize: 13 }}>{label}</div>
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
};

const colorStyle: React.CSSProperties = {
  width: 64,
  height: 40,
  border: "1px solid var(--border)",
  borderRadius: 12,
  background: "transparent",
};

const linkPrimary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid ${theme.accent.primary}`,
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 900,
};

const linkSecondary: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid var(--border)",
  color: "var(--text)",
  textDecoration: "none",
  fontWeight: 900,
};

function buttonPrimary(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: `1px solid ${theme.accent.primary}`,
    background: "transparent",
    color: "var(--text)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

function buttonSecondary(disabled: boolean): React.CSSProperties {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid var(--border)",
    background: "transparent",
    color: "var(--text)",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.7 : 1,
  };
}

// ---------- Full body renderer ----------
function AvatarFullBody({
  avatar,
  condition,
}: {
  avatar: Required<AvatarJson>;
  condition: { tier: string; acne: number; softness: number; glow: number };
}) {
  // Canvas size
  const W = 360;
  const H = 520;

  // Height scaling
  const heightScale = avatar.height === "short" ? 0.92 : avatar.height === "tall" ? 1.08 : 1.0;

  // Body proportions by type
  const body = (() => {
    switch (avatar.bodyType) {
      case "slim":
        return { shoulder: 86, chest: 92, waist: 70, hip: 78, arm: 10, leg: 12 };
      case "average":
        return { shoulder: 94, chest: 98, waist: 78, hip: 86, arm: 12, leg: 14 };
      case "buff":
        return { shoulder: 110, chest: 112, waist: 86, hip: 92, arm: 16, leg: 16 };
      case "chubby":
        return { shoulder: 98, chest: 110, waist: 102, hip: 108, arm: 14, leg: 16 };
    }
  })();

  // Condition "softness" affects waist/cheeks a bit
  const soft = condition.softness;
  const waist = body.waist + soft * 18;
  const hip = body.hip + soft * 14;

  // Face shape dims
  const face = (() => {
    switch (avatar.faceShape) {
      case "oval":
        return { rx: 48, ry: 58 };
      case "round":
        return { rx: 54, ry: 56 };
      case "square":
        return { rx: 52, ry: 54 };
    }
  })();

  // Eye shape
  const eye = avatar.eyeShape === "round" ? { rx: 10, ry: 10 } : { rx: 14, ry: 9 };

  // Brow thickness
  const browW = avatar.browStyle === "thin" ? 16 : avatar.browStyle === "thick" ? 26 : 20;
  const browH = avatar.browStyle === "thin" ? 3 : avatar.browStyle === "thick" ? 6 : 4;

  // Mouth style
  const mouthPath =
    avatar.mouthStyle === "neutral"
      ? "M150 166 C165 166, 175 166, 190 166"
      : avatar.mouthStyle === "grin"
      ? "M148 162 C165 184, 175 184, 192 162"
      : "M148 164 C165 178, 175 178, 192 164";

  // Acne dots
  const acneDots = [];
  const acneCount = Math.round(condition.acne * 16);
  for (let i = 0; i < acneCount; i++) {
    const x = 170 + (((i * 17) % 60) - 30);
    const y = 138 + (((i * 23) % 50) - 25);
    acneDots.push(<circle key={i} cx={x} cy={y} r={3} fill="rgba(239,68,68,0.75)" />);
  }

  // Hair
  const hair = (() => {
    const c = avatar.hairColor;
    switch (avatar.hairStyle) {
      case "buzz":
        return <rect x={118} y={40} width={104} height={46} rx={22} fill={c} opacity={0.9} />;
      case "short":
        return <path d="M114 78 C124 36, 216 36, 226 78 C214 68, 126 68, 114 78 Z" fill={c} />;
      case "medium":
        return <path d="M106 86 C120 30, 220 30, 234 86 C238 128, 102 128, 106 86 Z" fill={c} />;
      case "long":
        return <path d="M98 94 C116 22, 224 22, 242 94 C250 170, 90 170, 98 94 Z" fill={c} />;
      case "curly":
        return (
          <>
            <path d="M105 92 C118 26, 222 26, 235 92 C235 92, 105 92, 105 92 Z" fill={c} />
            {Array.from({ length: 10 }).map((_, i) => (
              <circle
                key={i}
                cx={120 + i * 12}
                cy={78 + ((i % 2) * 6)}
                r={10}
                fill={c}
                opacity={0.95}
              />
            ))}
          </>
        );
    }
  })();

  // Facial hair
  const facialHair = (() => {
    const c = "rgba(0,0,0,0.35)";
    if (avatar.facialHair === "none") return null;
    if (avatar.facialHair === "stubble") {
      return <path d="M132 170 C150 192, 190 192, 208 170" fill="none" stroke={c} strokeWidth={6} strokeLinecap="round" opacity={0.7} />;
    }
    return (
      <path
        d="M132 170 C142 208, 198 208, 208 170 C204 214, 136 214, 132 170 Z"
        fill={c}
        opacity={0.65}
      />
    );
  })();

  // Glasses
  const glasses = (() => {
    if (avatar.glasses === "none") return null;
    const frame = "rgba(255,255,255,0.55)";
    const rx = avatar.glasses === "round" ? 15 : 12;
    const ry = avatar.glasses === "round" ? 12 : 10;
    return (
      <>
        <ellipse cx={150} cy={130} rx={rx} ry={ry} fill="none" stroke={frame} strokeWidth={3} />
        <ellipse cx={190} cy={130} rx={rx} ry={ry} fill="none" stroke={frame} strokeWidth={3} />
        <path d="M165 130 L175 130" stroke={frame} strokeWidth={3} strokeLinecap="round" />
      </>
    );
  })();

  // Hat
  const hat = (() => {
    if (avatar.hat === "none") return null;
    const c = avatar.outfitSecondary;
    if (avatar.hat === "beanie") {
      return (
        <>
          <path d="M120 76 C130 30, 210 30, 220 76 Z" fill={c} opacity={0.9} />
          <rect x={120} y={72} width={100} height={18} rx={9} fill={c} opacity={0.95} />
        </>
      );
    }
    // cap
    return (
      <>
        <path d="M122 78 C132 38, 208 38, 218 78 Z" fill={c} opacity={0.9} />
        <path d="M212 84 C238 84, 252 92, 252 98 C252 104, 238 106, 212 102 Z" fill={c} opacity={0.85} />
      </>
    );
  })();

  // Outfit (simple silhouettes, color-driven)
  const top = (() => {
    const p = avatar.outfitPrimary;
    const s = avatar.outfitSecondary;
    switch (avatar.top) {
      case "hoodie":
        return (
          <>
            <path d="M120 260 C140 230, 220 230, 240 260 L258 350 L102 350 Z" fill={p} opacity={0.75} />
            <path d="M140 258 C156 242, 204 242, 220 258" fill="none" stroke={s} strokeWidth={6} strokeLinecap="round" opacity={0.8} />
          </>
        );
      case "tee":
        return <path d="M116 255 L244 255 L262 350 L98 350 Z" fill={p} opacity={0.72} />;
      case "tank":
        return (
          <>
            <path d="M134 255 L226 255 L248 350 L112 350 Z" fill={p} opacity={0.72} />
            <path d="M134 255 C140 240, 150 236, 160 250" fill="none" stroke={s} strokeWidth={6} opacity={0.85} />
            <path d="M226 255 C220 240, 210 236, 200 250" fill="none" stroke={s} strokeWidth={6} opacity={0.85} />
          </>
        );
      case "longsleeve":
        return (
          <>
            <path d="M116 255 L244 255 L262 350 L98 350 Z" fill={p} opacity={0.72} />
            <path d="M98 300 L70 350" stroke={p} strokeWidth={18} strokeLinecap="round" opacity={0.75} />
            <path d="M262 300 L290 350" stroke={p} strokeWidth={18} strokeLinecap="round" opacity={0.75} />
          </>
        );
    }
  })();

  const bottom = (() => {
    const p = avatar.outfitSecondary;
    switch (avatar.bottom) {
      case "shorts":
        return <path d="M120 350 L240 350 L225 410 L135 410 Z" fill={p} opacity={0.78} />;
      case "jeans":
        return <path d="M118 350 L242 350 L255 470 L105 470 Z" fill={p} opacity={0.78} />;
      case "joggers":
        return <path d="M120 350 L240 350 L250 468 L110 468 Z" fill={p} opacity={0.78} />;
    }
  })();

  const shoes = (() => {
    const p = "rgba(255,255,255,0.75)";
    const s = "rgba(255,255,255,0.35)";
    if (avatar.shoes === "slides") {
      return (
        <>
          <path d="M118 472 C130 460, 150 460, 162 472 C150 482, 130 482, 118 472 Z" fill={s} />
          <path d="M198 472 C210 460, 230 460, 242 472 C230 482, 210 482, 198 472 Z" fill={s} />
        </>
      );
    }
    return (
      <>
        <path d="M112 475 C128 456, 156 456, 172 475 C152 490, 132 490, 112 475 Z" fill={p} opacity={0.55} />
        <path d="M188 475 C204 456, 232 456, 248 475 C228 490, 208 490, 188 475 Z" fill={p} opacity={0.55} />
      </>
    );
  })();

  // Arms/legs are implied via torso/hips scaling, keep simple for now
  const centerX = W / 2;

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      <svg
        width="100%"
        style={{ maxWidth: 420, borderRadius: 14, border: "1px solid var(--border)", background: "rgba(255,255,255,0.03)" }}
        viewBox={`0 0 ${W} ${H}`}
      >
        {/* Glow */}
        {condition.glow > 0 ? (
          <circle cx={centerX} cy={200} r={170} fill="rgba(245,158,11,0.14)" opacity={condition.glow} />
        ) : null}

        {/* Head group (scaled by height) */}
        <g transform={`translate(0,0) scale(${heightScale})`}>
          {/* Hair behind (some styles) */}
          {avatar.hairStyle === "long" ? (
            <path d="M92 100 C110 18, 250 18, 268 100 C280 210, 80 210, 92 100 Z" fill={avatar.hairColor} opacity={0.9} />
          ) : null}

          {/* Face */}
          <ellipse cx={centerX} cy={140} rx={face.rx + soft * 6} ry={face.ry + soft * 4} fill={avatar.skinTone} />

          {/* Hair front */}
          {hair}

          {/* Hat */}
          {hat}

          {/* Brows */}
          <rect x={150 - browW} y={112} width={browW} height={browH} rx={browH} fill="rgba(0,0,0,0.35)" opacity={0.7} />
          <rect x={190} y={112} width={browW} height={browH} rx={browH} fill="rgba(0,0,0,0.35)" opacity={0.7} />

          {/* Eyes */}
          <ellipse cx={150} cy={132} rx={eye.rx} ry={eye.ry} fill="rgba(0,0,0,0.35)" />
          <ellipse cx={190} cy={132} rx={eye.rx} ry={eye.ry} fill="rgba(0,0,0,0.35)" />
          <circle cx={150} cy={132} r={Math.min(eye.ry, 7)} fill={avatar.eyeColor} />
          <circle cx={190} cy={132} r={Math.min(eye.ry, 7)} fill={avatar.eyeColor} />

          {/* Glasses */}
          {glasses}

          {/* Mouth */}
          <path d={mouthPath} fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth={6} strokeLinecap="round" />

          {/* Facial hair */}
          {facialHair}

          {/* Acne overlay */}
          {acneDots}
        </g>

        {/* Body */}
        <g transform={`translate(0, ${avatar.height === "short" ? 10 : avatar.height === "tall" ? -10 : 0})`}>
          {/* Torso/hips silhouette */}
          <path
            d={`
              M ${centerX - body.shoulder} 250
              C ${centerX - body.chest} 290, ${centerX - waist} 305, ${centerX - hip} 350
              L ${centerX + hip} 350
              C ${centerX + waist} 305, ${centerX + body.chest} 290, ${centerX + body.shoulder} 250
              Z
            `}
            fill="rgba(255,255,255,0.02)"
            stroke="rgba(255,255,255,0.08)"
          />

          {/* Outfit layers */}
          {top}
          {bottom}

          {/* Shoes */}
          {shoes}
        </g>
      </svg>
    </div>
  );
}
