import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async () => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")! // REQUIRED
  );

  const now = new Date();
  const currentDay = now.getDay(); // 0 = Sun, 1 = Mon...
  const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

  // 1. Fetch reminders that are due
  const { data: reminders, error } = await supabase
    .from("tasks")
    .select(`
      id,
      title,
      reminder_time,
      reminder_days,
      user_id,
      last_reminded_at
    `)
    .eq("reminders_enabled", true)
    .lte("reminder_time", currentTime)
    .or(`last_reminded_at.is.null,last_reminded_at.lt.${now.toDateString()}`);

  if (error) {
    console.error(error);
    return new Response("Error", { status: 500 });
  }

  // 2. Filter by weekday (Mon/Wed/Fri logic)
  const due = reminders.filter((r) =>
    r.reminder_days?.includes(currentDay)
  );

  // 3. Send notifications
  for (const reminder of due) {
    // TODO: fetch push token
    // TODO: send push notification

    await supabase
      .from("tasks")
      .update({ last_reminded_at: now.toISOString() })
      .eq("id", reminder.id);
  }

  return new Response(
    JSON.stringify({ processed: due.length }),
    { headers: { "Content-Type": "application/json" } }
  );
});
