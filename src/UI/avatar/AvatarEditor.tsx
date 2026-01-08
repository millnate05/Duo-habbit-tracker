// src/UI/avatar/AvatarEditor.tsx
"use client";

import React, { useMemo, useState } from "react";
import { DEFAULT_AVATAR, cssVars, renderAvatarSvg, type AvatarRecipe } from "@/engine/avatar/avatar";

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function AvatarEditor() {
  const [recipe, setRecipe] = useState<AvatarRecipe>(DEFAULT_AVATAR);

  const svg = useMemo(() => renderAvatarSvg(recipe, 512), [recipe]);
  const vars = useMemo(() => cssVars(recipe), [recipe]);

  return (
    <div
      style={{
        // full page content area
        minHeight: "calc(100vh - 64px)", // if you have a fixed header ~64px; adjust/remove if not
        display: "flex",
        flexDirection: "column",
        gap: 12,
        padding: 16,
      }}
    >
      {/* TOP: Avatar preview (60% of viewport height) */}
      <div
        style={{
          height: "60vh",
          minHeight: 360,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 16,
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Keep avatar nicely sized within the box */}
        <div
          style={{
            width: "min(520px, 90%)",
            aspectRatio: "1 / 1",
            display: "grid",
            placeItems: "center",
            ...(vars as any),
          }}
          // render raw svg
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      </div>

      {/* BOTTOM: Controls */}
      <div
        style={{
          flex: 1,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 16,
          padding: 16,
          overflowY: "auto",
        }}
      >
        <h2 style={{ margin: "0 0 12px 0", fontSize: 18 }}>Customize</h2>

        <SliderRow
          label="Face Length"
          value={recipe.faceLength}
          min={0.5}
          max={1.5}
          step={0.01}
          onChange={(v) => setRecipe((r) => ({ ...r, faceLength: v }))}
        />

        <SliderRow
          label="Cheek Width"
          value={recipe.cheekWidth}
          min={0.5}
          max={1.5}
          step={0.01}
          onChange={(v) => setRecipe((r) => ({ ...r, cheekWidth: v }))}
        />

        <SliderRow
          label="Jaw Width"
          value={recipe.jawWidth}
          min={0.5}
          max={1.5}
          step={0.01}
          onChange={(v) => setRecipe((r) => ({ ...r, jawWidth: v }))}
        />

        {/* Add more controls here as needed */}
      </div>
    </div>
  );
}

function SliderRow(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  const { label, value, min, max, step = 0.01, onChange } = props;

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        <div style={{ fontVariantNumeric: "tabular-nums", opacity: 0.8 }}>{value.toFixed(2)}</div>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        style={{ width: "100%" }}
      />
    </div>
  );
}
