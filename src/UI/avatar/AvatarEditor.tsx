"use client";

import React from "react";
import type { AvatarRecipe } from "@/engine/avatar/types";
import { DEFAULT_AVATAR } from "@/engine/avatar/types";
import { AvatarPreview } from "./AvatarPreview";

type Option<T extends string> = { id: T; label: string };

const SKIN: Option<AvatarRecipe["skin"]>[] = [
  { id: "s1", label: "Porcelain" },
  { id: "s2", label: "Light" },
  { id: "s3", label: "Medium" },
  { id: "s4", label: "Tan" },
  { id: "s5", label: "Brown" },
  { id: "s6", label: "Deep" },
];

const HAIR: Option<AvatarRecipe["hair"]>[] = [
  { id: "h0", label: "None" },
  { id: "h1", label: "Classic" },
  { id: "h2", label: "Sweep" },
];

const HAIR_COLOR: Option<AvatarRecipe["hairColor"]>[] = [
  { id: "hc1", label: "Black" },
  { id: "hc2", label: "Brown" },
  { id: "hc3", label: "Auburn" },
  { id: "hc4", label: "Blonde" },
];

const OUTFIT: Option<AvatarRecipe["outfit"]>[] = [
  { id: "o1", label: "Tee" },
  { id: "o2", label: "Hoodie" },
];

const SHOES: Option<AvatarRecipe["shoes"]>[] = [
  { id: "sh1", label: "White" },
  { id: "sh2", label: "Black" },
];

const ACCESSORY: Option<AvatarRecipe["accessory"]>[] = [
  { id: "a0", label: "None" },
  { id: "a1", label: "Glasses" },
];

function Row<T extends string>({
  title,
  options,
  value,
  onChange,
}: {
  title: string;
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 700 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: `1px solid var(--border)`,
              background: o.id === value ? "rgba(255,255,255,0.08)" : "transparent",
              color: "var(--text)",
              cursor: "pointer",
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
    // Very simple starter randomizer — we can improve with “good combo rules”
    const pick = <T extends string>(arr: Option<T>[]) => arr[Math.floor(Math.random() * arr.length)].id;
    setRecipe((r) => ({
      ...r,
      skin: pick(SKIN),
      hair: pick(HAIR),
      hairColor: pick(HAIR_COLOR),
      outfit: pick(OUTFIT),
      shoes: pick(SHOES),
      accessory: pick(ACCESSORY),
    }));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ position: "sticky", top: 80 }}>
        <AvatarPreview recipe={recipe} size={300} />
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
              fontWeight: 700,
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
        <Row title="Skin" options={SKIN} value={recipe.skin} onChange={(v) => setRecipe((r) => ({ ...r, skin: v }))} />
        <Row title="Hair" options={HAIR} value={recipe.hair} onChange={(v) => setRecipe((r) => ({ ...r, hair: v }))} />
        <Row
          title="Hair Color"
          options={HAIR_COLOR}
          value={recipe.hairColor}
          onChange={(v) => setRecipe((r) => ({ ...r, hairColor: v }))}
        />
        <Row
          title="Outfit"
          options={OUTFIT}
          value={recipe.outfit}
          onChange={(v) => setRecipe((r) => ({ ...r, outfit: v }))}
        />
        <Row
          title="Shoes"
          options={SHOES}
          value={recipe.shoes}
          onChange={(v) => setRecipe((r) => ({ ...r, shoes: v }))}
        />
        <Row
          title="Accessory"
          options={ACCESSORY}
          value={recipe.accessory}
          onChange={(v) => setRecipe((r) => ({ ...r, accessory: v }))}
        />
      </div>
    </div>
  );
}

