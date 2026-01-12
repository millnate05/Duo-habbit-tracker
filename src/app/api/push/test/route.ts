import { NextResponse } from "next/server";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;
  const privateKey = process.env.VAPID_PRIVATE_KEY!;

  webpush.setVapidDetails(
    "mailto:test@example.com",
    publicKey.trim(),
    privateKey.trim()
  );

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .limit(1);

  if (error || !subs || subs.length === 0) {
    return NextResponse.json({ error: "No subscriptions found" }, { status: 400 });
  }

  const sub = subs[0];

  await webpush.sendNotification(
    {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    } as any,
    JSON.stringify({
      title: "Test Push",
      body: "If you see this, push delivery works ✅",
      url: "/profile",
    })
  );

  return NextResponse.json({ ok: true });
}
