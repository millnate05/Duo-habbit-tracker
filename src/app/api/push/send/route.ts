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

  // actual schema in public.reminders
  reminder_time: string | null; // "HH:MM:SS"
  tz: string | null; // IANA timezone
  scheduled_days: number[] | null; // optional; assume 0-6 (Sun=0)
  next_fire_at: string | null; // timestamptz (optional; computed by app)
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

// Convert "HH:MM" or "HH:MM:SS" -> {h,m} or null
function parseTimeOfDay(s: string | null): { h: number; m: number } | null {
  if (!s) return null;
  const trimmed = s.trim();
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) return null;

  const h = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;

  return { h, m };
}

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

// Due logic for your current reminders table:
// - daily at reminder_time in tz
// - optional scheduled_days filter (if provided)
// - 10 minute window after target time
function isDueNow(rem: ReminderRow, nowUtc: Date): { due: boolean; reason?: string } {
  if (!rem.enabled) return { due: false, reason: "disabled" };

  const tz = rem.tz || "UTC";
  let parts: ReturnType<typeof getZonedParts>;
  try {
    parts = getZonedParts(nowUtc, tz);
  } catch {
    return { due: false, reason: "bad_timezone" };
  }

  // scheduled_days filter if set
  if (Array.isArray(rem.scheduled_days) && rem.scheduled_days.length > 0) {
    if (!rem.scheduled_days.includes(parts.dow)) return { due: false, reason: "day_not_allowed" };
  }

  const tod = parseTimeOfDay(rem.reminder_time);
  if (!tod) return { due: false, reason: "bad_time_of_day" };

  const nowTotal = parts.hour * 60 + parts.minute;
  const targetTotal = tod.h * 60 + tod.m;

  const WINDOW_MINUTES = 10;
  if (nowTotal < targetTotal) return { due: false, reason: "too_early" };
  if (nowTotal >= targetTotal + WINDOW_MINUTES) return { due: false, reason: "too_late" };

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

  // Auth
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

  // Direct-send mode
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

  // CRON MODE: read schedules from public.reminders
  const nowUtc = new Date();

  const { data: reminders, error: remErr } = await supabase
    .from("reminders")
    .select("id,user_id,task_id,enabled,reminder_time,tz,scheduled_days,next_fire_at,tasks:tasks(title)")
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
  if (!subs || subs.length === 0)
    return { sent: 0, failed: 1, cleaned: 0, status: 404, error: "No subscriptions for user" };

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
