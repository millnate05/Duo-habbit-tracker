"use client";

import React from "react";
import type { AvatarRecipe } from "@/engine/avatar/avatar";
import { DEFAULT_AVATAR } from "@/engine/avatar/avatar";
import { AvatarPreview } from "./AvatarPreview";

type Option<T extends string> = { id: T; label: string };

const SKIN: Option<AvatarRecipe["skinTone"]>[] = [{ id: "olive", label: "Olive" }];

function Row<T extends string>(props: {
  title: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { title, options, value, onChange } = props;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: o.id === value ? "rgba(255,255,255,0.08)" : "transparent",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function AvatarEditor({
  initial,
  onSave,
}: {
  initial?: AvatarRecipe | null;
  onSave: (recipe: AvatarRecipe) => Promise<void>;
}) {
  const [recipe, setRecipe] = React.useState<AvatarRecipe>(initial ?? DEFAULT_AVATAR);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(recipe);
    } finally {
      setSaving(false);
    }
  }

  function randomize() {
    // Only one option for now—this keeps the button functional without breaking types
    setRecipe((r) => ({ ...r, skinTone: "olive" }));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ position: "sticky", top: 80 }}>
        <AvatarPreview recipe={recipe} size={320} />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            onClick={randomize}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "transparent",
              color: "var(--text)",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            Randomize
          </button>

          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.08)",
              color: "var(--text)",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 18 }}>
        <Row
          title="Skin Tone"
          options={SKIN}
          value={recipe.skinTone}
          onChange={(v) => setRecipe((r) => ({ ...r, skinTone: v }))}
        />
        <div style={{ opacity: 0.75, fontSize: 14, lineHeight: 1.4 }}>
          More options (hair, eyes, etc.) will appear here as we add them back into the engine.
        </div>
      </div>
    </div>
  );
}
