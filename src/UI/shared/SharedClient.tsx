"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "../../engine/supabase/Client";

type Profile = {
  user_id: string;
  display_name: string | null;
  email: string | null;
};

type PartnershipRow = {
  owner_id: string;
  partner_id: string;
};

type TaskType = "habit" | "single";
type FrequencyUnit = "day" | "week" | "month" | "year";
type AssignChoice = "me" | "partner" | "both";

type Task = {
  id: string;
  user_id: string; // OWNER (we keep this as meId to satisfy RLS)
  title: string;
  type: TaskType;
  freq_times: number | null;
  freq_per: FrequencyUnit | null;
  scheduled_days: number[] | null;
  weekly_skips_allowed: number;
  is_shared: boolean;
  archived: boolean;
  created_at: string;
  created_by: string | null;
  assigned_to: string | null; // UUID
  punishment: string | null;
  reward: string | null;
};

const ORANGE = "#ff7a18";

const DOW = [
  { n: 0, label: "Sun" },
  { n: 1, label: "Mon" },
  { n: 2, label: "Tue" },
  { n: 3, label: "Wed" },
  { n: 4, label: "Thu" },
  { n: 5, label: "Fri" },
  { n: 6, label: "Sat" },
];

function fmtScheduledDays(days: number[] | null) {
  if (!days || days.length === 0) return "Every day";
  const sorted = [...days].sort((a, b) => a - b);
  return sorted.map((d) => DOW.find((x) => x.n === d)?.label ?? "?").join(", ");
}

function parseBoundedInt(raw: string, opts: { min: number; max: number; fallback: number }) {
  const s = raw.trim();
  if (s === "") return opts.fallback;
  const n = Number(s);
  if (!Number.isFinite(n)) return opts.fallback;
  return Math.max(opts.min, Math.min(opts.max, Math.floor(n)));
}

function onNumberFieldChange(setter: (v: string) => void, raw: string) {
  if (raw === "") return setter("");
  if (/^\d+$/.test(raw)) return setter(raw);
}

/**
 * Force orange + basic input sizing (matches your Create page vibe)
 */
const globalFixesCSS = `
:root { --dht-orange: ${ORANGE}; }
input, select, textarea, button { font-size: 16px; }
`;

function Icon({
  children,
  size = 18,
  color,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
}) {
  return (
    <span
      aria-hidden
      style={{
        width: size,
        height: size,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: color ?? "var(--dht-orange)",
        flex: "0 0 auto",
      }}
    >
      {children}
    </span>
  );
}

function ILink() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 1 1 7 7l-1 1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 1 1-7-7l1-1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function ITitle() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 7h10M7 12h10M7 17h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IType() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 7h10v10H7z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M9 9h6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function ICalendar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M7 3v3M17 3v3M4 8h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M6 5h12a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ISkips() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M8 7h8M8 12h8M8 17h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 14l2 2m0-2-2 2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
function IUsers() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M16 11a4 4 0 1 0-8 0"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M6 19c.8-3 3.2-5 6-5s5.2 2 6 5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
function IGift() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path d="M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M4 12h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M12 22V7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M12 7H9.5a2.5 2.5 0 1 1 0-5C12 2 12 7 12 7Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M12 7h2.5a2.5 2.5 0 1 0 0-5C12 2 12 7 12 7Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function IAlert() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9v4"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M12 17h.01"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      <path
        d="M10.3 4.2 3.3 18.2A2 2 0 0 0 5.1 21h13.8a2 2 0 0 0 1.8-2.8l-7-14a2 2 0 0 0-3.4 0Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
  right,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        justifyContent: "space-between",
        marginBottom: 10,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            border: `1px solid rgba(255,255,255,0.12)`,
            background: `linear-gradient(180deg, rgba(255,122,24,0.14), rgba(255,255,255,0.03))`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 10px 22px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(0,0,0,0.25)`,
            flex: "0 0 auto",
          }}
        >
          {icon}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ fontWeight: 950, fontSize: 16, lineHeight: 1.1 }}>{title}</div>
          {subtitle ? <div style={{ fontSize: 13, opacity: 0.78 }}>{subtitle}</div> : null}
        </div>
      </div>

      {right ? <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{right}</div> : null}
    </div>
  );
}

function SoftButton({
  children,
  onClick,
  disabled,
  small,
  active,
  orangeBorder,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  small?: boolean;
  active?: boolean;
  orangeBorder?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        padding: small ? "8px 10px" : "12px 14px",
        borderRadius: 14,
        border: `1px solid ${active || orangeBorder ? "rgba(255,122,24,0.85)" : "var(--border)"}`,
        background: active ? "rgba(255,122,24,0.12)" : "rgba(255,255,255,0.03)",
        color: "var(--text)",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        fontSize: small ? 13 : 14,
        lineHeight: 1,
        whiteSpace: "nowrap",
        boxShadow: active ? `0 0 0 3px rgba(255,122,24,0.10)` : "none",
      }}
    >
      {children}
    </button>
  );
}

function DangerButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        border: "1px solid rgba(255, 99, 99, 0.75)",
        background: "rgba(255, 99, 99, 0.12)",
        color: "var(--text)",
        fontWeight: 950,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function DayPill({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        padding: "8px 10px",
        borderRadius: 999,
        border: `1px solid ${active ? "rgba(255,122,24,0.90)" : "var(--border)"}`,
        background: active ? "rgba(255,122,24,0.12)" : "transparent",
        color: "var(--text)",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : active ? 1 : 0.82,
        boxShadow: active ? "0 0 0 3px rgba(255,122,24,0.08)" : "none",
      }}
    >
      {label}
    </button>
  );
}

function BigPlusButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Create shared task"
      style={{
        position: "fixed",
        right: 22,
        bottom: 22,
        width: 62,
        height: 62,
        borderRadius: 18,
        border: "1px solid rgba(255,122,24,0.65)",
        background: "rgba(255,122,24,0.14)",
        boxShadow: "0 14px 30px rgba(0,0,0,0.38), 0 0 0 4px rgba(255,122,24,0.10) inset",
        color: "var(--text)",
        cursor: "pointer",
        fontWeight: 950,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
    >
      <span style={{ fontSize: 30, lineHeight: 1, color: "var(--dht-orange)" }}>+</span>
    </button>
  );
}

function Modal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 80,
        display: "flex",
        justifyContent: "center",
        padding: 18,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "min(980px, 100%)",
          marginTop: 40,
          marginBottom: 40,
          borderRadius: 22,
          border: "1px solid rgba(255,122,24,0.20)",
          background: "rgba(20,20,20,0.92)",
          boxShadow: "0 18px 50px rgba(0,0,0,0.55), 0 0 0 4px rgba(255,122,24,0.06) inset",
          padding: 16,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function SharedClient() {
  const supabase = useMemo(() => createClient(), []);

  const [meId, setMeId] = useState<string | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);

  // UI: filter like "Tasks page" (my vs partner)
  const [activeTab, setActiveTab] = useState<"me" | "partner">("me");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  // Form fields (create/edit)
  const [title, setTitle] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("habit");
  const [freqTimesStr, setFreqTimesStr] = useState<string>("1");
  const [freqPer, setFreqPer] = useState<FrequencyUnit>("week");
  const [scheduledDays, setScheduledDays] = useState<number[] | null>(null);
  const [weeklySkipsAllowedStr, setWeeklySkipsAllowedStr] = useState<string>("0");
  const [assignTo, setAssignTo] = useState<AssignChoice>("me");
  const [punishment, setPunishment] = useState("");
  const [reward, setReward] = useState("");

  const linked = !!partner;

  const baseField: React.CSSProperties = {
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid var(--border)",
    background: "rgba(255,255,255,0.02)",
    color: "var(--text)",
    outline: "none",
    width: "100%",
    fontWeight: 700,
    fontSize: 16,
    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
  };

  const cleanSelect: React.CSSProperties = {
    ...baseField,
    WebkitAppearance: "none",
    MozAppearance: "none",
    appearance: "none",
    paddingRight: 38,
    backgroundImage:
      'url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27%3E%3Cpath d=%27M6 8l4 4 4-4%27 fill=%27none%27 stroke=%27%23c9c9c9%27 stroke-width=%272%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27/%3E%3C/svg%3E")',
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
    backgroundSize: "16px 16px",
  };

  const titleRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setStatus("Loading…");
      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (!alive) return;

      if (authErr) {
        setStatus(authErr.message);
        return;
      }

      const user = auth?.user;
      if (!user) {
        setStatus("Please log in.");
        return;
      }

      setMeId(user.id);
      await loadPartner(user.id);
      setStatus(null);
    })();

    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!meId) return;
    if (!linked) return;
    loadSharedTasks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meId, linked]);

  async function loadPartner(me: string) {
    setStatus(null);

    const { data: links, error } = await supabase
      .from("partnerships")
      .select("owner_id, partner_id")
      .or(`owner_id.eq.${me},partner_id.eq.${me}`)
      .limit(1);

    if (error) {
      setStatus(error.message);
      setPartner(null);
      return;
    }

    const link = (links?.[0] as PartnershipRow | undefined) ?? null;
    if (!link) {
      setPartner(null);
      return;
    }

    const otherId = link.owner_id === me ? link.partner_id : link.owner_id;

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("user_id, display_name, email")
      .eq("user_id", otherId)
      .maybeSingle();

    if (profErr) {
      setStatus(profErr.message);
      setPartner(null);
      return;
    }

    setPartner((prof as Profile) ?? null);
  }

  async function loadSharedTasks() {
    setStatus(null);

    const { data, error } = await supabase
      .from("tasks")
      .select(
        "id,user_id,title,type,freq_times,freq_per,scheduled_days,weekly_skips_allowed,is_shared,archived,created_at,created_by,assigned_to,punishment,reward"
      )
      .eq("is_shared", true)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .limit(300);

    if (error) {
      setStatus(error.message);
      return;
    }

    setTasks((data as Task[]) ?? []);
  }

  async function linkNow() {
    if (!meId) return;

    const e = email.trim().toLowerCase();
    if (!e) return setStatus("Enter an email.");

    setBusy(true);
    setStatus(null);

    const { error } = await supabase.rpc("link_partner_by_email", { partner_email: e });

    if (error) {
      setBusy(false);
      setStatus(error.message);
      return;
    }

    setEmail("");
    await loadPartner(meId);
    await loadSharedTasks();

    setBusy(false);
    setStatus("Linked ✅");
  }

  async function unlinkNow() {
    if (!meId) return;

    setBusy(true);
    setStatus(null);

    const { error } = await supabase.rpc("unlink_partner");
    if (error) {
      setBusy(false);
      setStatus(error.message);
      return;
    }

    setPartner(null);
    setTasks([]);
    setBusy(false);
    setStatus("Unlinked.");
  }

  function resetForm() {
    setEditId(null);
    setTitle("");
    setTaskType("habit");
    setFreqTimesStr("1");
    setFreqPer("week");
    setScheduledDays(null);
    setWeeklySkipsAllowedStr("0");
    setAssignTo("me");
    setPunishment("");
    setReward("");
  }

  function openCreate() {
    resetForm();
    setModalOpen(true);
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  function openEdit(t: Task) {
    setEditId(t.id);
    setTitle(t.title ?? "");
    setTaskType(t.type ?? "habit");
    setFreqTimesStr(String(t.freq_times ?? 1));
    setFreqPer((t.freq_per as FrequencyUnit) ?? "week");
    setScheduledDays(t.scheduled_days ?? null);
    setWeeklySkipsAllowedStr(String(t.weekly_skips_allowed ?? 0));
    setPunishment(t.punishment ?? "");
    setReward(t.reward ?? "");

    // In edit mode, keep assignTo as the single current assignee (don’t allow "both" edits here)
    if (t.assigned_to && meId && t.assigned_to !== meId) setAssignTo("partner");
    else setAssignTo("me");

    setModalOpen(true);
    setTimeout(() => titleRef.current?.focus(), 50);
  }

  function toggleDay(day: number) {
    const base = scheduledDays ?? [0, 1, 2, 3, 4, 5, 6];
    const set = new Set(base);
    if (set.has(day)) set.delete(day);
    else set.add(day);
    const next = Array.from(set).sort((a, b) => a - b);
    if (next.length === 7) setScheduledDays(null);
    else setScheduledDays(next);
  }

  const times = useMemo(
    () => parseBoundedInt(freqTimesStr, { min: 1, max: 365, fallback: 1 }),
    [freqTimesStr]
  );
  const skips = useMemo(
    () => parseBoundedInt(weeklySkipsAllowedStr, { min: 0, max: 7, fallback: 0 }),
    [weeklySkipsAllowedStr]
  );

  const partnerLabel =
    partner?.display_name ?? partner?.email ?? (partner ? partner.user_id.slice(0, 8) : "Partner");

  // IMPORTANT: split by assignee (owner will be meId for all shared rows)
  const myTasks = useMemo(() => tasks.filter((t) => meId && t.assigned_to === meId), [tasks, meId]);
  const partnerTasks = useMemo(
    () => tasks.filter((t) => meId && t.assigned_to && t.assigned_to !== meId),
    [tasks, meId]
  );

  const shownTasks = activeTab === "me" ? myTasks : partnerTasks;

  function assignedLabel(t: Task) {
    if (!meId) return "—";
    if (t.assigned_to === meId) return "Me";
    if (t.assigned_to === partner?.user_id) return partnerLabel;
    return t.assigned_to ? t.assigned_to.slice(0, 8) : "—";
  }

  async function saveSharedTask() {
    if (!meId || !partner) {
      setStatus("Link a partner first.");
      return;
    }
    if (busy) return;

    const trimmed = title.trim();
    if (!trimmed) {
      setStatus("Give the task a title.");
      return;
    }

    setBusy(true);
    setStatus(null);

    try {
      const buildRow = (assigneeId: string) => ({
        user_id: meId, // OWNER ALWAYS ME (RLS)
        title: trimmed,
        type: taskType,
        freq_times: taskType === "habit" ? times : null,
        freq_per: taskType === "habit" ? freqPer : null,
        scheduled_days: scheduledDays,
        weekly_skips_allowed: skips,
        is_shared: true,
        archived: false,
        created_by: meId,
        assigned_to: assigneeId, // UUID (meId or partner.user_id)
        punishment: punishment.trim() ? punishment.trim() : null,
        reward: reward.trim() ? reward.trim() : null,
      });

      // Edit mode: update single row
      if (editId) {
        const assigneeId = assignTo === "partner" ? partner.user_id : meId;

        const payload = {
          title: trimmed,
          type: taskType,
          freq_times: taskType === "habit" ? times : null,
          freq_per: taskType === "habit" ? freqPer : null,
          scheduled_days: scheduledDays,
          weekly_skips_allowed: skips,
          // keep shared-only fields here:
          punishment: punishment.trim() ? punishment.trim() : null,
          reward: reward.trim() ? reward.trim() : null,
          // allow switching between me/partner on edit (still single):
          assigned_to: assigneeId,
        };

        const { error } = await supabase.from("tasks").update(payload).eq("id", editId).eq("user_id", meId);
        if (error) throw error;

        setModalOpen(false);
        resetForm();
        await loadSharedTasks();
        setStatus("Saved ✅");
        return;
      }

      // Create mode: allow me/partner/both
      const rows =
        assignTo === "me"
          ? [buildRow(meId)]
          : assignTo === "partner"
          ? [buildRow(partner.user_id)]
          : [buildRow(meId), buildRow(partner.user_id)];

      const { error } = await supabase.from("tasks").insert(rows);
      if (error) throw error;

      setModalOpen(false);
      resetForm();
      await loadSharedTasks();
      setStatus("Task created ✅");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to save shared task.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteSharedTask() {
    if (!meId || !editId) return;
    if (busy) return;

    const ok = window.confirm("Delete this shared task permanently? This cannot be undone.");
    if (!ok) return;

    setBusy(true);
    setStatus(null);

    try {
      const { error } = await supabase.from("tasks").delete().eq("id", editId).eq("user_id", meId);
      if (error) throw error;

      setModalOpen(false);
      resetForm();
      await loadSharedTasks();
      setStatus("Deleted ✅");
    } catch (e: any) {
      setStatus(e?.message ?? "Failed to delete.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--page)",
        color: "var(--text)",
        padding: 20,
        paddingBottom: 110,
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <style>{globalFixesCSS}</style>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 34, fontWeight: 950 }}>Shared</h1>

        {linked ? (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,122,24,0.25)",
                background: "rgba(255,122,24,0.08)",
                fontWeight: 950,
                fontSize: 13,
              }}
            >
              Linked: <span style={{ color: "var(--dht-orange)" }}>{partnerLabel}</span>
            </div>

            <SoftButton disabled={busy} onClick={loadSharedTasks} small orangeBorder>
              Refresh
            </SoftButton>
            <SoftButton disabled={busy} onClick={unlinkNow} small>
              Unlink
            </SoftButton>
          </div>
        ) : null}
      </div>

      {status ? (
        <div
          style={{
            marginTop: 14,
            padding: 12,
            border: "1px solid rgba(255,122,24,0.25)",
            borderRadius: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
          }}
        >
          {status}
        </div>
      ) : null}

      <div style={{ height: 14 }} />

      {!linked ? (
        <div
          style={{
            border: "1px solid rgba(255,122,24,0.20)",
            borderRadius: 22,
            padding: 16,
            background: "rgba(255,255,255,0.02)",
            boxShadow: "0 10px 24px rgba(0,0,0,0.25), 0 0 0 4px rgba(255,122,24,0.06) inset",
          }}
        >
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <ILink />
                </Icon>
              }
              title="Link a partner"
              subtitle="They must already have an account."
            />

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="partner@email.com"
                style={{ ...baseField, maxWidth: 360 }}
              />
              <SoftButton disabled={busy || !email.trim()} onClick={linkNow} orangeBorder>
                Link
              </SoftButton>
            </div>
          </section>
        </div>
      ) : (
        <>
          {/* Tabs like Tasks page */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SoftButton
              disabled={busy}
              onClick={() => setActiveTab("me")}
              active={activeTab === "me"}
              orangeBorder={activeTab === "me"}
            >
              My shared tasks ({myTasks.length})
            </SoftButton>
            <SoftButton
              disabled={busy}
              onClick={() => setActiveTab("partner")}
              active={activeTab === "partner"}
              orangeBorder={activeTab === "partner"}
            >
              Partner shared tasks ({partnerTasks.length})
            </SoftButton>
          </div>

          <div style={{ height: 12 }} />

          {/* List card like Tasks page */}
          <div
            style={{
              border: "1px solid rgba(255,122,24,0.20)",
              borderRadius: 22,
              padding: 16,
              background: "rgba(255,255,255,0.02)",
              boxShadow: "0 10px 24px rgba(0,0,0,0.25), 0 0 0 4px rgba(255,122,24,0.06) inset",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            {shownTasks.length === 0 ? (
              <div style={{ opacity: 0.78, padding: 14, border: "1px dashed rgba(255,122,24,0.35)", borderRadius: 16 }}>
                No shared tasks here yet.
              </div>
            ) : (
              shownTasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openEdit(t)}
                  style={{
                    textAlign: "left",
                    width: "100%",
                    border: "1px solid var(--border)",
                    borderRadius: 18,
                    padding: 14,
                    background: "rgba(255,255,255,0.02)",
                    boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.25)",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                    <div style={{ fontWeight: 950, fontSize: 16 }}>{t.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.72 }}>
                      {new Date(t.created_at).toLocaleDateString()}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8, fontSize: 13, opacity: 0.85 }}>
                    <span style={{ fontWeight: 900, color: "var(--dht-orange)" }}>{assignedLabel(t)}</span>
                    <span>•</span>
                    <span style={{ fontWeight: 900 }}>{t.type === "habit" ? "Habit" : "Single"}</span>
                    {t.type === "habit" && t.freq_times && t.freq_per ? (
                      <>
                        <span>•</span>
                        <span>
                          {t.freq_times}/{t.freq_per}
                        </span>
                      </>
                    ) : null}
                    <span>•</span>
                    <span>{fmtScheduledDays(t.scheduled_days)}</span>
                    <span>•</span>
                    <span>{t.weekly_skips_allowed} skips</span>
                  </div>

                  {(t.reward || t.punishment) ? (
                    <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      {t.reward ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <Icon>
                            <IGift />
                          </Icon>
                          <div style={{ fontSize: 13, opacity: 0.92 }}>
                            <b>Reward:</b> {t.reward}
                          </div>
                        </div>
                      ) : null}

                      {t.punishment ? (
                        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                          <Icon>
                            <IAlert />
                          </Icon>
                          <div style={{ fontSize: 13, opacity: 0.92 }}>
                            <b>Punishment:</b> {t.punishment}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </button>
              ))
            )}
          </div>

          <BigPlusButton onClick={openCreate} />
        </>
      )}

      {/* Create/Edit modal (matches your Create Task page layout) */}
      <Modal
        open={modalOpen}
        onClose={() => {
          if (busy) return;
          setModalOpen(false);
          resetForm();
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontSize: 22, fontWeight: 950 }}>
            {editId ? "Edit shared task" : "New shared task"}
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <SoftButton
              disabled={busy}
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
            >
              Cancel
            </SoftButton>

            {editId ? (
              <DangerButton disabled={busy} onClick={deleteSharedTask}>
                Delete
              </DangerButton>
            ) : null}

            <SoftButton disabled={busy || !title.trim()} onClick={saveSharedTask} orangeBorder>
              {editId ? "Save" : "Create"}
            </SoftButton>
          </div>
        </div>

        <div style={{ height: 12 }} />

        {/* Form card */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Title */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <ITitle />
                </Icon>
              }
              title="Title"
            />
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Gym session"
              style={baseField}
              disabled={busy}
            />
          </section>

          {/* Type */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <IType />
                </Icon>
              }
              title="Type"
            />

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <select value={taskType} onChange={(e) => setTaskType(e.target.value as TaskType)} style={cleanSelect} disabled={busy}>
                <option value="habit">Habit (recurring)</option>
                <option value="single">Single (one-time)</option>
              </select>

              {taskType === "habit" ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Times</div>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={freqTimesStr}
                      onChange={(e) => onNumberFieldChange(setFreqTimesStr, e.target.value)}
                      style={baseField}
                      disabled={busy}
                      placeholder="1"
                    />
                  </div>
                  <div>
                    <div style={{ fontWeight: 900, marginBottom: 8 }}>Per</div>
                    <select value={freqPer} onChange={(e) => setFreqPer(e.target.value as FrequencyUnit)} style={cleanSelect} disabled={busy}>
                      <option value="day">Day</option>
                      <option value="week">Week</option>
                      <option value="month">Month</option>
                      <option value="year">Year</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div style={{ opacity: 0.8, fontSize: 13 }}>Single tasks don’t need frequency.</div>
              )}
            </div>
          </section>

          {/* Assign to (shared-only) */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <IUsers />
                </Icon>
              }
              title="Assign to"
              subtitle={editId ? "Edit assigns to one person (switch Me/Partner)." : "Choose Me / Partner / Both"}
            />

            <select
              value={assignTo}
              onChange={(e) => setAssignTo(e.target.value as AssignChoice)}
              style={cleanSelect}
              disabled={busy || (!partner ? true : false)}
            >
              <option value="me">Me</option>
              <option value="partner">{partnerLabel}</option>
              {!editId ? <option value="both">Both</option> : null}
            </select>

            {!editId ? (
              <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>
                “Both” will create two rows: one assigned to you, one assigned to your partner.
              </div>
            ) : null}
          </section>

          {/* Scheduled days */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <ICalendar />
                </Icon>
              }
              title="Scheduled days"
              subtitle={
                <>
                  Current: <b style={{ color: "var(--dht-orange)" }}>{fmtScheduledDays(scheduledDays)}</b>
                </>
              }
            />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {DOW.map((x) => {
                const active = scheduledDays == null ? true : scheduledDays.includes(x.n);
                return <DayPill key={x.n} label={x.label} active={active} disabled={busy} onClick={() => toggleDay(x.n)} />;
              })}
            </div>
          </section>

          {/* Weekly skips */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <ISkips />
                </Icon>
              }
              title="Weekly skips allowed"
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
              <div>
                <input
                  type="text"
                  inputMode="numeric"
                  value={weeklySkipsAllowedStr}
                  onChange={(e) => onNumberFieldChange(setWeeklySkipsAllowedStr, e.target.value)}
                  style={baseField}
                  disabled={busy}
                  placeholder="0"
                />
              </div>
              <div style={{ fontSize: 13, opacity: 0.78 }}>Allows misses without “failing” the week.</div>
            </div>
          </section>

          {/* Rewards + punishments (shared-only) */}
          <section style={{ border: "1px solid var(--border)", borderRadius: 18, padding: 14 }}>
            <SectionHeader
              icon={
                <Icon>
                  <IGift />
                </Icon>
              }
              title="Reward & Punishment"
              subtitle="These stay on Shared only."
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Reward (optional)</div>
                <textarea
                  value={reward}
                  onChange={(e) => setReward(e.target.value)}
                  placeholder="e.g., movie night / pick dinner"
                  style={{
                    ...baseField,
                    minHeight: 110,
                    resize: "vertical",
                  }}
                  disabled={busy}
                />
              </div>

              <div>
                <div style={{ fontWeight: 900, marginBottom: 8 }}>Punishment (optional)</div>
                <textarea
                  value={punishment}
                  onChange={(e) => setPunishment(e.target.value)}
                  placeholder="e.g., $10 to the other person / no dessert"
                  style={{
                    ...baseField,
                    minHeight: 110,
                    resize: "vertical",
                  }}
                  disabled={busy}
                />
              </div>
            </div>
          </section>
        </div>
      </Modal>
    </main>
  );
}
