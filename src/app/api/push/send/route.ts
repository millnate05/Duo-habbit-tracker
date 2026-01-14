import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

type Body = {
  user_id: string;
  title: string;
  body: string;
  url?: string;
};

function getServiceKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    ""
  );
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = getServiceKey();
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY!;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

  if (!supabaseUrl || !serviceKey || !vapidPublic || !vapidPrivate) {
    return NextResponse.json({ error: "Missing env vars" }, { status: 500 });
  }

  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  // Prevent random people from spamming pushes
  if (!token || token !== serviceKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body?.user_id || !body?.title || !body?.body) {
    return NextResponse.json({ error: "Missing user_id/title/body" }, { status: 400 });
  }

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth")
    .eq("user_id", body.user_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!subs || subs.length === 0) return NextResponse.json({ error: "No subscriptions for user" }, { status: 404 });

  const payload = JSON.stringify({
    title: body.title,
    body: body.body,
    url: body.url || "/tasks",
  });

  const results = await Promise.allSettled(
    subs.map((s) =>
      webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      )
    )
  );

  // cleanup dead subscriptions
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

  return NextResponse.json({
    ok: true,
    sent: results.filter((r) => r.status === "fulfilled").length,
    failed: results.filter((r) => r.status === "rejected").length,
    cleaned: deadEndpoints.length,
  });
}
