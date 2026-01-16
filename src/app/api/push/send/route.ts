import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  // Direct-send mode
  user_id?: string;
  title?: string;
  body?: string;
  url?: string;
  debug?: boolean;
};

type ReminderRow = {
  id: string;
  user_id: string;
  task_id: string;
  enabled: boolean;
  timezone: string | null;
  time_of_day: string | null; // "HH:MM" (expected)
  cadence: string | null; // "daily" | "weekly" | "monthly" | "yearly" (we’ll handle these)
  days_of_week: number[] | null; // ARRAY of 0-6 (Sun=0)
  day_of_month: number | null;
  week_of_month: number | null;
  weekday: number | null; // 0-6
  month_of_year: number | null; // 1-12
  day_of_year_month: number | null;
  start_date: string | null; // "YYYY-MM-DD"
  end_date: string | null; // "YYYY-MM-DD"
  tasks?: { title?: string | null } | null;
};

function getServiceKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  );
}

function getCronTokenExpected() {
  return process.env.CRON_PUSH_TOKEN || "";
}

// Convert "HH:MM" -> {h,m} or null
function parseTimeOfDay(s: string | null): { h: number; m: number } | null {
  if (!s) return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

// Get date/time parts in a specific IANA timezone
function getZonedParts(date: Date, timeZone: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });

  const parts = dtf.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;

  const year = Number(get("year"));
  const month = Number(get("month")); // 1-12
  const day = Number(get("day")); // 1-31
  const hour = Number(get("hour"));
  const minute = Number(get("minute"));

  // weekday mapping (Sun=0..Sat=6)
  const wd = get("weekday");
  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = wd && wd in dowMap ? dowMap[wd] : new Date(date).getUTCDay();

  const ymd = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  return { year, month, day, hour, minute, dow, ymd };
}

function isWithinDateWindow(rem: ReminderRow, zonedYmd: string) {
  // Compare as strings "YYYY-MM-DD" safely since same format
  if (rem.start_date && zonedYmd < rem.start_date) return false;
  if (rem.end_date && zonedYmd > rem.end_date) return false;
  return true;
}

// Minimal cadence rules using your schema:
// - daily: every day (optionally restricted by days_of_week if provided)
// - weekly: only on days_of_week (if provided); otherwise use weekday column if present
// - monthly: if day_of_month set, must match; else if week_of_month+weekday set, must match
// - yearly: if month_of_year + day_of_month set, must match (basic)
function cadenceAllowsToday(rem: ReminderRow, parts: ReturnType<typeof getZonedParts>): boolean {
  const cadence = (rem.cadence || "daily").toLowerCase();

  if (cadence === "daily") {
    // If days_of_week provided, treat it as allowed-days filter
    if (Array.isArray(rem.days_of_week) && rem.days_of_week.length > 0) {
      return rem.days_of_week.includes(parts.dow);
    }
    return true;
  }

  if (cadence === "weekly") {
    if (Array.isArray(rem.days_of_week) && rem.days_of_week.length > 0) {
      return rem.days_of_week.includes(parts.dow);
    }
    if (typeof rem.weekday === "number") return rem.weekday === parts.dow;
    return true; // fallback
  }

  if (cadence === "monthly") {
    if (typeof rem.day_of_month === "number" && rem.day_of_month >= 1 && rem.day_of_month <= 31) {
      return parts.day === rem.day_of_month;
    }
    // Week-of-month + weekday (e.g., 2nd Monday)
    if (
      typeof rem.week_of_month === "number" &&
      rem.week_of_month >= 1 &&
      rem.week_of_month <= 5 &&
      typeof rem.weekday === "number"
    ) {
      const weekIndex = Math.floor((parts.day - 1) / 7) + 1; // 1..5
      return weekIndex === rem.week_of_month && parts.dow === rem.weekday;
    }
    return false;
  }

  if (cadence === "yearly") {
    if (
      typeof rem.month_of_year === "number" &&
      rem.month_of_year >= 1 &&
      rem.month_of_year <= 12 &&
      typeof rem.day_of_month === "number" &&
      rem.day_of_month >= 1 &&
      rem.day_of_month <= 31
    ) {
      return parts.month === rem.month_of_year && parts.day === rem.day_of_month;
    }
    return false;
  }

  // Unknown cadence -> do nothing
  return false;
}

// Decide if it’s time to fire *right now*.
// Cron runs every 2 minutes, so we allow a small window (2 minutes).
function isDueNow(rem: ReminderRow, nowUtc: Date): { due: boolean; reason?: string } {
  if (!rem.enabled) return { due: false, reason: "disabled" };

  const tz = rem.timezone || "UTC";
  let parts: ReturnType<typeof getZonedParts>;
  try {
    parts = getZonedParts(nowUtc, tz);
  } catch {
    return { due: false, reason: "bad_timezone" };
  }

  if (!isWithinDateWindow(rem, parts.ymd)) return { due: false, reason: "outside_date_window" };
  if (!cadenceAllowsToday(rem, parts)) return { due: false, reason: "cadence_not_today" };

  const tod = parseTimeOfDay(rem.time_of_day);
  if (!tod) return { due: false, reason: "bad_time_of_day" };

  // Window: allow firing if current time is within [targetMinute, targetMinute+2)
  // Example: target 08:00, cron at 08:00 or 08:02 should still fire once.

const nowTotal = parts.hour * 60 + parts.minute;
const targetTotal = tod.h * 60 + tod.m;

// Window: allow firing if current time is within the last 10 minutes
  
const WINDOW_MINUTES = 10;

if (nowTotal < targetTotal) return { due: false, reason: "too_early" };
if (nowTotal >= targetTotal + WINDOW_MINUTES)
  return { due: false, reason: "too_late" };

return { due: true };

}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = getServiceKey();

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || "";
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    return NextResponse.json(
      {
        error: "Missing env vars",
        have: {
          supabaseUrl: !!supabaseUrl,
          serviceKeyLength: serviceKey.length,
          vapidPublic: !!vapidPublic,
          vapidPrivate: !!vapidPrivate,
          cronTokenLength: getCronTokenExpected().length,
        },
      },
      { status: 500 }
    );
  }

  // Auth (cron + manual tests)
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const expected = getCronTokenExpected();
  if (!token || !expected || token !== expected) {
    return NextResponse.json(
      {
        error: "Unauthorized",
        debug: {
          authHeaderStartsWithBearer: authHeader.startsWith("Bearer "),
          tokenLength: token.length,
          expectedLength: expected.length,
          matches: token === expected,
        },
      },
      { status: 401 }
    );
  }

  // Parse body (may be {} for cron mode)
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, serviceKey);

  const isDirectSend = !!(body?.user_id && body?.title && body?.body);

  if (isDirectSend) {
    const result = await sendToUser({
      supabase,
      user_id: body.user_id!,
      title: body.title!,
      body: body.body!,
      url: body.url || "/tasks",
    });

    return NextResponse.json({ ok: true, mode: "direct", ...result });
  }

  // CRON MODE: read schedules from task_reminders and compute due reminders
  const nowUtc = new Date();

  const { data: reminders, error: remErr } = await supabase
    .from("task_reminders")
    .select(
      "id,user_id,task_id,enabled,timezone,time_of_day,cadence,days_of_week,day_of_month,week_of_month,weekday,month_of_year,day_of_year_month,start_date,end_date,tasks:tasks(title)"
    )
    .eq("enabled", true)
    .limit(500);

  if (remErr) {
    return NextResponse.json({ error: remErr.message }, { status: 500 });
  }

  let checked = 0;
  let dueCount = 0;
  let sent = 0;
  let failed = 0;

  for (const rem of (reminders as ReminderRow[]) || []) {
    checked++;

    const due = isDueNow(rem, nowUtc);
    if (!due.due) continue;
    dueCount++;

    const title = rem.tasks?.title || "Reminder";
    const message = "Reminder";
    const url = "/tasks";

    const res = await sendToUser({
      supabase,
      user_id: rem.user_id,
      title,
      body: message,
      url,
    });

    sent += res.sent;
    if (res.failed > 0) failed += 1;
  }

  return NextResponse.json({
    ok: true,
    mode: "process_in_send",
    checked,
    due: dueCount,
    sent,
    failed,
  });
}

async function sendToUser(args: {
  supabase: any;
  user_id: string;
  title: string;
  body: string;
  url: string;
}): Promise<{ sent: number; failed: number; cleaned: number; status?: number; error?: string }> {
  const { supabase, user_id, title, body, url } = args;

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", user_id);

  if (error) return { sent: 0, failed: 1, cleaned: 0, status: 500, error: error.message };
  if (!subs || subs.length === 0) return { sent: 0, failed: 1, cleaned: 0, status: 404, error: "No subscriptions for user" };

  const payload = JSON.stringify({ title, body, url });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  const deadEndpoints: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "rejected") {
      const code = String((r.reason as any)?.statusCode || "");
      if (code === "404" || code === "410") deadEndpoints.push(subs[i].endpoint);
    }
  });

  if (deadEndpoints.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", deadEndpoints);
  }

  return {
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    cleaned: deadEndpoints.length,
  };
}
