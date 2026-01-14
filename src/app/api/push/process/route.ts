import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getServiceKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  );
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceKey = getServiceKey();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || ""; // e.g. https://duohabbittracker-nate-02-02-05.vercel.app

  if (!supabaseUrl || !serviceKey || !siteUrl) {
    return NextResponse.json(
      { error: "Missing env vars", have: { supabaseUrl: !!supabaseUrl, serviceKey: !!serviceKey, siteUrl: !!siteUrl } },
      { status: 500 }
    );
  }

  // Auth: only cron (Supabase) should call this
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token !== serviceKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  // 1) Get due reminders
  const { data: due, error: dueErr } = await supabase.rpc("get_due_task_reminders");
  if (dueErr) return NextResponse.json({ error: dueErr.message }, { status: 500 });

  const list = (due ?? []) as Array<{
    reminder_id: string;
    user_id: string;
    task_id: string;
    title: string;
    timezone: string;
    time_of_day: string;
  }>;

  if (list.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // 2) Send pushes + log sends
  let sent = 0;
  let failed = 0;

  for (const r of list) {
    try {
      // call your send endpoint (same auth)
      const res = await fetch(`${siteUrl}/api/push/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: r.user_id,
          title: "Reminder",
          body: r.title,
          url: "/tasks",
        }),
      });

      if (!res.ok) {
        failed++;
        continue;
      }

      // log idempotency bucket = current minute UTC
      const bucket = new Date();
      bucket.setSeconds(0, 0);

      const { error: logErr } = await supabase.from("reminder_sends").insert({
        reminder_id: r.reminder_id,
        user_id: r.user_id,
        sent_bucket: bucket.toISOString(),
      });

      // If insert fails because duplicate, that’s fine (already sent)
      if (!logErr) sent++;
    } catch {
      failed++;
    }
  }

  return NextResponse.json({ ok: true, processed: list.length, sent, failed });
}
