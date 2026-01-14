import { serve } from "https://deno.land/std@0.203.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Make sure you have set these as Supabase secrets:
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
  try {
    // Get current UTC timestamp
    const now = new Date().toISOString();
 
    // Fetch reminders due now or in the past that haven't been processed
    const { data: reminders, error } = await supabase
      .from("reminders")
      .select("*")
      .eq("processed", false)
      .lte("reminder_time", now);

    if (error) {
      console.error("Error fetching reminders:", error);
      return new Response(JSON.stringify({ error: true, message: error.message }), {
        status: 500,
      });
    }

    if (!reminders || reminders.length === 0) {
      return new Response(JSON.stringify({ message: "No reminders due" }), {
        status: 200,
      });
    }

    // Here you would trigger the notifications for each reminder
    for (const reminder of reminders) {
      console.log("Sending reminder for:", reminder);

      // Example: if using push notifications
      // await sendPushNotification(reminder.user_id, reminder.message);

      // Mark reminder as processed
      await supabase
        .from("reminders")
        .update({ processed: true })
        .eq("id", reminder.id);
    }

    return new Response(JSON.stringify({ message: "Reminders processed" }), {
      status: 200,
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: true, message: err.message }), {
      status: 500,
    });
  }
});
