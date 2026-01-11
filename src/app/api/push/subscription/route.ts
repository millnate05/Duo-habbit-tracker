import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Body =
  | {
      action: "upsert";
      endpoint: string;
      keys: { p256dh: string; auth: string };
      userAgent?: string;
      platform?: string;
      locale?: string;
    }
  | { action: "delete"; endpoint: string };

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  // Expect Authorization: Bearer <access_token>
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // IMPORTANT: create a client that includes the user's JWT for ALL db calls
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  // Validate token + get user
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  const user = userData?.user ?? null;

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Body;

  if (!body?.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  if (body.action === "upsert") {
    if (!("keys" in body) || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: "Missing subscription keys" }, { status: 400 });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        {
          user_id: user.id,
          endpoint: body.endpoint,
          p256dh: body.keys.p256dh,
          auth: body.keys.auth,
          user_agent: body.userAgent ?? null,
          platform: body.platform ?? null,
          locale: body.locale ?? null,
        },
        { onConflict: "endpoint" }
      );

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete") {
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", body.endpoint);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
