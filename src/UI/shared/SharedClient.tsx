"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/engine/supabase/Client";

type PartnerLink = { partner_id: string };

type Profile = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
};

type Task = {
  id: string;
  user_id: string;
  title: string;
  is_shared: boolean;
  archived: boolean;
  created_at: string;
};

export default function SharedClient() {
  const supabase = useMemo(() => createClient(), []);
  const [meId, setMeId] = useState<string | null>(null);
  const [partner, setPartner] = useState<Profile | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [status, setStatus] = useState<string>("Loading…");

  useEffect(() => {
    (async () => {
      setStatus("Loading…");

      const { data: auth, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        setStatus(authErr.message);
        return;
      }
      if (!auth?.user) {
        setStatus("You must be logged in to view Shared.");
        return;
      }

      setMeId(auth.user.id);

      // Find partner (v1 assumes 0 or 1 partner link row)
      const { data: links, error: linkErr } = await supabase
        .from("partnerships")
        .select("partner_id")
        .eq("owner_id", auth.user.id)
        .limit(1);

      if (linkErr) {
        setStatus(linkErr.message);
        return;
      }

      if (links && links.length > 0) {
        const partnerId = (links[0] as PartnerLink).partner_id;

        const { data: prof, error: profErr } = await supabase
          .from("profiles")
          .select("user_id, display_name, avatar_url")
          .eq("user_id", partnerId)
          .maybeSingle();

        if (profErr) {
          setStatus(profErr.message);
          return;
        }

        if (prof) setPartner(prof as Profile);
      }

      // Load tasks I’m allowed to see (RLS controls visibility)
      const { data: taskRows, error: tasksErr } = await supabase
        .from("tasks")
        .select("id,user_id,title,is_shared,archived,created_at")
        .eq("is_shared", true)
        .eq("archived", false)
        .order("created_at", { ascending: false })
        .limit(200);

      if (tasksErr) {
        setStatus(tasksErr.message);
        return;
      }

      setTasks((taskRows as Task[]) ?? []);
      setStatus("");
    })();
  }, [supabase]);

  const myTasks = tasks.filter((t) => t.user_id === meId);
  const partnerTasks = tasks.filter((t) => t.user_id !== meId);

  return (
    <main style={{ padding: 16, maxWidth: 900, margin: "0 auto" }}>
      <h1 style={{ marginTop: 0 }}>Shared</h1>

      {status ? (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            border: "1px solid var(--border)",
            borderRadius: 12,
          }}
        >
          {status}
        </div>
      ) : null}

      <section
        style={{
          marginTop: 16,
          padding: 16,
          border: "1px solid var(--border)",
          borderRadius: 16,
        }}
      >
        <h2 style={{ marginTop: 0 }}>Partner</h2>
        {partner ? (
          <div>
            Linked to:{" "}
            <b>{partner.display_name ?? partner.user_id.slice(0, 8)}</b>
          </div>
        ) : (
          <div style={{ opacity: 0.8 }}>
            No partner linked yet. (Next step: add “link by email” UI.)
          </div>
        )}
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
        <TaskBox title="My Shared Tasks" tasks={myTasks} />
        <TaskBox title="Partner Shared Tasks" tasks={partnerTasks} />
      </div>
    </main>
  );
}

function TaskBox({ title, tasks }: { title: string; tasks: Task[] }) {
  return (
    <section style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 16 }}>
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      {tasks.length === 0 ? (
        <div style={{ opacity: 0.75 }}>None yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {tasks.map((t) => (
            <div
              key={t.id}
              style={{
                padding: 12,
                border: "1px solid var(--border)",
                borderRadius: 14,
              }}
            >
              <div style={{ fontWeight: 700 }}>{t.title}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                {new Date(t.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
