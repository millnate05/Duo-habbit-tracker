"use client";

import React from "react";
import type { AvatarRecipe } from "@/engine/avatar/types";
import { DEFAULT_AVATAR } from "@/engine/avatar/types";
import { AvatarPreview } from "./AvatarPreview";

type Option<T extends string> = { id: T; label: string };

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
      <div style={{ fontWeight: 800 }}>{title}</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {options.map((o) => {
          const active = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(o.id)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: active ? "rgba(255,255,255,0.10)" : "transparent",
                color: "var(--text)",
                cursor: "pointer",
                fontWeight: active ? 800 : 600,
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** OPTIONS (must match AvatarRecipe unions exactly) */
const SKIN: Option<AvatarRecipe["skinTone"]>[] = [
  { id: "s1", label: "Porcelain" },
  { id: "s2", label: "Light" },
  { id: "s3", label: "Medium" },
  { id: "s4", label: "Tan" },
  { id: "s5", label: "Brown" },
  { id: "s6", label: "Deep" },
];

const HAIR_COLOR: Option<AvatarRecipe["hairColor"]>[] = [
  { id: "hc1", label: "Black" },
  { id: "hc2", label: "Brown" },
  { id: "hc3", label: "Auburn" },
  { id: "hc4", label: "Blonde" },
];

const HEAD: Option<AvatarRecipe["head"]>[] = [{ id: "head01", label: "Head 01" }];

const EYES: Option<AvatarRecipe["eyes"]>[] = [
  { id: "eyes01", label: "Eyes 01" },
  { id: "eyes02", label: "Eyes 02" },
];

const BROWS: Option<AvatarRecipe["brows"]>[] = [
  { id: "brows01", label: "Brows 01" },
  { id: "brows02", label: "Brows 02" },
];

const NOSE: Option<AvatarRecipe["nose"]>[] = [{ id: "nose01", label: "Nose 01" }];

const MOUTH: Option<AvatarRecipe["mouth"]>[] = [
  { id: "mouth01", label: "Mouth 01" },
  { id: "mouth02", label: "Mouth 02" },
];

const HAIR: Option<AvatarRecipe["hair"]>[] = [
  { id: "hair01", label: "Classic" },
  { id: "hair02", label: "Sweep" },
];

const OUTFIT_TOP: Option<AvatarRecipe["outfitTop"]>[] = [
  { id: "top01", label: "Tee" },
  { id: "top02", label: "Hoodie" },
];

const ACCESSORY: Option<AvatarRecipe["accessory"]>[] = [
  { id: "none", label: "None" },
  { id: "glasses01", label: "Glasses" },
];

const pick = <T extends string,>(arr: Option<T>[]) =>
  arr[Math.floor(Math.random() * arr.length)].id;

export function AvatarEditor({
  initial,
  onSave,
}: {
  initial?: AvatarRecipe | null;
  onSave: (recipe: AvatarRecipe) => Promise<void>;
}) {
  const [recipe, setRecipe] = React.useState<AvatarRecipe>(initial ?? DEFAULT_AVATAR);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await onSave(recipe);
    } catch (e: any) {
      setError(e?.message ?? "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function randomize() {
    // Keep required pieces valid according to AvatarRecipe unions
    setRecipe((r) => ({
      ...r,
      skinTone: pick(SKIN),
      hairColor: pick(HAIR_COLOR),
      head: pick(HEAD),
      eyes: pick(EYES),
      brows: pick(BROWS),
      nose: pick(NOSE),
      mouth: pick(MOUTH),
      hair: pick(HAIR),
      outfitTop: pick(OUTFIT_TOP),
      accessory: pick(ACCESSORY),
    }));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "360px 1fr", gap: 20, alignItems: "start" }}>
      <div style={{ position: "sticky", top: 80 }}>
        <AvatarPreview recipe={recipe} size={300} />

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            type="button"
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
            type="button"
            onClick={save}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(255,255,255,0.10)",
              color: "var(--text)",
              cursor: saving ? "not-allowed" : "pointer",
              fontWeight: 900,
            }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {error ? (
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--text)", opacity: 0.9 }}>
            <span style={{ fontWeight: 900 }}>Error:</span> {error}
          </div>
        ) : null}
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

        <Row title="Head" options={HEAD} value={recipe.head} onChange={(v) => setRecipe((r) => ({ ...r, head: v }))} />

        <Row title="Brows" options={BROWS} value={recipe.brows} onChange={(v) => setRecipe((r) => ({ ...r, brows: v }))} />
        <Row title="Eyes" options={EYES} value={recipe.eyes} onChange={(v) => setRecipe((r) => ({ ...r, eyes: v }))} />
        <Row title="Nose" options={NOSE} value={recipe.nose} onChange={(v) => setRecipe((r) => ({ ...r, nose: v }))} />
        <Row title="Mouth" options={MOUTH} value={recipe.mouth} onChange={(v) => setRecipe((r) => ({ ...r, mouth: v }))} />

        <Row
          title="Outfit"
          options={OUTFIT_TOP}
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
