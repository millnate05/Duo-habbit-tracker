// src/app/api/push/subscription/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

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

function getBearerToken(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
}

export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnon) {
    return NextResponse.json({ error: "Missing Supabase env vars" }, { status: 500 });
  }

  // Create a cookie-aware Supabase server client (works for PWA/browser sessions)
  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        cookieStore.set({ name, value, ...options });
      },
      remove(name: string, options: any) {
        cookieStore.set({ name, value: "", ...options, maxAge: 0 });
      },
    },
  });

  // If a Bearer token is provided, prefer it (works for external callers/tests)
  const bearer = getBearerToken(req);
  const authSupabase = bearer
    ? createServerClient(supabaseUrl, supabaseAnon, {
        cookies: {
          get: () => undefined,
          set: () => {},
          remove: () => {},
        },
        global: {
          headers: { Authorization: `Bearer ${bearer}` },
        },
      })
    : supabase;

  // Validate session/token + get user
  const { data: userData, error: userErr } = await authSupabase.auth.getUser();
  const user = userData?.user ?? null;

  if (userErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.endpoint) {
    return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  }

  if (body.action === "upsert") {
    if (!("keys" in body) || !body.keys?.p256dh || !body.keys?.auth) {
      return NextResponse.json({ error: "Missing subscription keys" }, { status: 400 });
    }

    const { error } = await authSupabase
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
    const { error } = await authSupabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.id)
      .eq("endpoint", body.endpoint);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
