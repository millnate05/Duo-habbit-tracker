"use client";
 
import React from "react";
import { AvatarEditor } from "@/UI/avatar/AvatarEditor";
import type { AvatarRecipe } from "@/engine/avatar/types";
import { createClient } from "@/engine/supabase/Client"; // <-- adjust to your actual path

export default function AvatarPageClient() {
  const supabase = React.useMemo(() => createClient(), []);
  const [initial, setInitial] = React.useState<AvatarRecipe | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      const user = auth.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("avatar")
        .eq("user_id", user.id)
        .single();

      if (!error && data?.avatar) setInitial(data.avatar as AvatarRecipe);
      setLoading(false);
    })();
  }, [supabase]);

  async function onSave(recipe: AvatarRecipe) {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth.user;
    if (!user) throw new Error("Not signed in");

    const { error } = await supabase
      .from("profiles")
      .update({ avatar: recipe })
      .eq("user_id", user.id);

    if (error) throw error;
  }

  if (loading) return <div style={{ padding: 16 }}>Loading avatar…</div>;

  return (
    <div style={{ padding: 16, maxWidth: 1100, margin: "0 auto" }}>
      <h1 style={{ margin: "12px 0 16px" }}>Avatar</h1>
      <p style={{ opacity: 0.8, marginTop: 0 }}>
        Customize your full-body avatar. Clean, consistent, Bitmoji-inspired style.
      </p>
      <AvatarEditor initial={initial} onSave={onSave} />
    </div>
  );
}
