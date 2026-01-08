"use client";

import React from "react";
import type { AvatarRecipe } from "@/engine/avatar/avatar";
import { DEFAULT_AVATAR } from "@/engine/avatar/avatar";
import { AvatarPreview } from "./AvatarPreview";

type Option<T extends string> = { id: T; label: string };

// IDs MUST match the union types in avatar.ts
const SKIN: Option<AvatarRecipe["skinTone"]>[] = [
  { id: "s1", label: "Porcelain" },
  { id: "s2", label: "Light" },
  { id: "s3", label: "Medium" },
  { id: "s4", label: "Tan" },
  { id: "s5", label: "Brown" },
  { id: "s6", label: "Deep" },
];

const HAIR: Option<AvatarRecipe["hair"]>[] = [
  { id: "hair01", label: "Classic" },
  { id: "hair02", label: "Sweep" },
];

const HAIR_COLOR: Option<AvatarRecipe["hairColor"]>[] = [
  { id: "hc1", label: "Black" },
  { id: "hc2", label: "Brown" },
  { id: "hc3", label: "Auburn" },
  { id: "hc4", label: "Blonde" },
];

const EYES: Option<AvatarRecipe["eyes"]>[] = [
  { id: "eyes01", label: "Open" },
  { id: "eyes02", label: "Soft" },
];

const BROWS: Option<AvatarRecipe["brows"]>[] = [
  { id: "brows01", label: "Neutral" },
  { id: "brows02", label: "Straight" },
];

const MOUTH: Option<AvatarRecipe["mouth"]>[] = [
  { id: "mouth01", label: "Smile" },
  { id: "mouth02", label: "Frown" },
];

const OUTFIT: Option<AvatarRecipe["outfitTop"]>[] = [
  { id: "top01", label: "Tee" },
  { id: "top02", label: "Hoodie" },
];

const ACCESSORY: Option<AvatarRecipe["accessory"]>[] = [
  { id: "none", label: "None" },
  { id: "glasses01", label: "Glasses" },
];

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
    const pick = <T extends string,>(arr: Option<T>[]) => arr[Math.floor(Math.random() * arr.length)].id;

    setRecipe((r) => ({
      ...r,
      skinTone: pick(SKIN),
      hair: pick(HAIR),
      hairColor: pick(HAIR_COLOR),
      eyes: pick(EYES),
      brows: pick(BROWS),
      mouth: pick(MOUTH),
      outfitTop: pick(OUTFIT),
      accessory: pick(ACCESSORY),
    }));
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
        <Row title="Skin" options={SKIN} value={recipe.skinTone} onChange={(v) => setRecipe((r) => ({ ...r, skinTone: v }))} />
        <Row title="Hair" options={HAIR} value={recipe.hair} onChange={(v) => setRecipe((r) => ({ ...r, hair: v }))} />
        <Row
          title="Hair Color"
          options={HAIR_COLOR}
          value={recipe.hairColor}
          onChange={(v) => setRecipe((r) => ({ ...r, hairColor: v }))}
        />
        <Row title="Eyes" options={EYES} value={recipe.eyes} onChange={(v) => setRecipe((r) => ({ ...r, eyes: v }))} />
        <Row title="Brows" options={BROWS} value={recipe.brows} onChange={(v) => setRecipe((r) => ({ ...r, brows: v }))} />
        <Row title="Mouth" options={MOUTH} value={recipe.mouth} onChange={(v) => setRecipe((r) => ({ ...r, mouth: v }))} />
        <Row
          title="Outfit"
          options={OUTFIT}
          value={recipe.outfitTop}
          onChange={(v) => setRecipe((r) => ({ ...r, outfitTop: v }))}
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
