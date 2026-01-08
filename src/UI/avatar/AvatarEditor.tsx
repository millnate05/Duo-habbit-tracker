"use client";

import React from "react";
import type { AvatarRecipe } from "@/engine/avatar/avatar";
import { DEFAULT_AVATAR } from "@/engine/avatar/avatar";
import { AvatarPreview } from "./AvatarPreview";

function SliderRow(props: {
  title: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const { title, value, onChange } = props;

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 800 }}>{title}</div>
        <div style={{ opacity: 0.8, fontVariantNumeric: "tabular-nums" }}>
          {value.toFixed(2)}×
        </div>
      </div>

      <input
        type="range"
        min={0.5}
        max={1.5}
        step={0.01}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          width: "100%",
          accentColor: "#f59e0b", // orange sliders
        }}
      />

      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.7 }}>
        <span>0.5×</span>
        <span>1.0×</span>
        <span>1.5×</span>
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
    const rand = () => Number((0.5 + Math.random() * 1.0).toFixed(2)); // 0.50–1.50

    setRecipe((r) => ({
      ...r,
      // keep hair fixed for now (crewcut), randomize only proportions
      faceLength: rand(),
      cheekWidth: rand(),
      jawWidth: rand(),
    }));
  }

  function reset() {
    setRecipe(DEFAULT_AVATAR);
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "360px 1fr",
        gap: 20,
        alignItems: "start",
      }}
    >
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
            onClick={reset}
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
            Reset
          </button>

          <button
            onClick={save}
            disabled={saving}
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "rgba(245,158,11,0.18)", // orange tint
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
        <SliderRow
          title="Face Length"
          value={recipe.faceLength}
          onChange={(v) => setRecipe((r) => ({ ...r, faceLength: v }))}
        />
        <SliderRow
          title="Cheek Width"
          value={recipe.cheekWidth}
          onChange={(v) => setRecipe((r) => ({ ...r, cheekWidth: v }))}
        />
        <SliderRow
          title="Jaw Width"
          value={recipe.jawWidth}
          onChange={(v) => setRecipe((r) => ({ ...r, jawWidth: v }))}
        />

        <div style={{ opacity: 0.8, fontSize: 13, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Hair</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ opacity: 0.8 }}>Style</span>
            <span style={{ fontWeight: 700 }}>{recipe.hair}</span>
          </div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            More hair styles + colors come next.
          </div>
        </div>
      </div>
    </div>
  );
}
