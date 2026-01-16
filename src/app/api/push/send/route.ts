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

  // Optional debug
  debug?: boolean;
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

function getDowLocal(): number {
  // Treat "scheduled days" as local to server timezone.
  // If you want this to be user-timezone aware later, we can extend it.
  return new Date().getDay(); // 0=Sun ... 6=Sat
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = getServiceKey();

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || "";
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  // Basic env validation
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

  // Auth: must match CRON_PUSH_TOKEN
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

  // Parse body (may be {} for cron)
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    // allow empty body: treat as cron-mode
    body = {};
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const supabase = createClient(supabaseUrl, serviceKey);

  // If body has user_id/title/body => direct send
  const isDirectSend = !!(body?.user_id && body?.title && body?.body);

  if (isDirectSend) {
    const result = await sendToUser({
      supabase,
      user_id: body.user_id!,
      title: body.title!,
      body: body.body!,
      url: body.url || "/tasks",
    });

    return NextResponse.json({
      ok: true,
      mode: "direct",
      ...result,
    });
  }

  // Otherwise: cron "process" mode — find due reminders and send them
  // Assumptions (adjust later if your schema differs):
  // - public.task_reminders: id, user_id, task_id, remind_at (timestamptz), last_sent_at (timestamptz nullable)
  // - public.tasks: id, title, scheduled_days (int[] nullable)
  //
  // Cooldown: do not send again within 3 minutes even if cron runs every 2 minutes
  const COOLDOWN_MINUTES = 3;

  const now = new Date();
  const windowStart = new Date(now.getTime() - 5 * 60 * 1000); // last 5 minutes
  const cooldownCutoff = new Date(now.getTime() - COOLDOWN_MINUTES * 60 * 1000);

  const { data: due, error: dueErr } = await supabase
    .from("task_reminders")
    .select(
      "id,user_id,task_id,remind_at,last_sent_at,tasks:tasks(id,title,scheduled_days)"
    )
    .lte("remind_at", now.toISOString())
    .gte("remind_at", windowStart.toISOString())
    .or(`last_sent_at.is.null,last_sent_at.lt.${cooldownCutoff.toISOString()}`)
    .limit(200);

  if (dueErr) {
    return NextResponse.json({ error: dueErr.message }, { status: 500 });
  }

  const localDow = getDowLocal();

  let checked = 0;
  let sent = 0;
  let failed = 0;

  for (const r of due || []) {
    checked++;

    const task = (r as any).tasks;
    const scheduledDays: number[] | null = task?.scheduled_days ?? null;

    // If scheduled_days is set, only send on those days
    if (Array.isArray(scheduledDays) && scheduledDays.length > 0) {
      if (!scheduledDays.includes(localDow)) {
        continue;
      }
    }

    const title = task?.title || "Reminder";
    const message = "Reminder";
    const url = "/tasks";

    const res = await sendToUser({
      supabase,
      user_id: r.user_id,
      title,
      body: message,
      url,
    });

    if (res.sent > 0) {
      sent += res.sent;

      // Mark as sent (idempotency)
      await supabase
        .from("task_reminders")
        .update({
          last_sent_at: now.toISOString(),
          last_error: null,
          last_status: 200,
        })
        .eq("id", r.id);
    } else {
      failed += 1;

      await supabase
        .from("task_reminders")
        .update({
          last_error: res.error || "send failed",
          last_status: res.status || 500,
        })
        .eq("id", r.id);
    }
  }

  return NextResponse.json({
    ok: true,
    mode: "process",
    checked,
    sent,
    failed,
  });
}

async function sendToUser(args: {
  supabase: ReturnType<typeof createClient>;
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
