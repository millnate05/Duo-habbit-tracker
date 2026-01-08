// src/UI/avatar/AvatarEditor.tsx
"use client";

import React from "react";
import { DEFAULT_AVATAR, cssVars, renderAvatarSvg, type AvatarRecipe } from "@/engine/avatar/avatar";

type AvatarEditorProps = {
  initial?: AvatarRecipe | null;
  onSave?: (recipe: AvatarRecipe) => Promise<void> | void;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function AvatarEditor({ initial, onSave }: AvatarEditorProps) {
  const [recipe, setRecipe] = React.useState<AvatarRecipe>(DEFAULT_AVATAR);
  const [saving, setSaving] = React.useState(false);
  const [saveMsg, setSaveMsg] = React.useState<string | null>(null);

  // Apply initial once when it arrives
  const appliedInitialRef = React.useRef(false);
  React.useEffect(() => {
    if (appliedInitialRef.current) return;
    if (!initial) return;
    setRecipe(initial);
    appliedInitialRef.current = true;
  }, [initial]);

  const svg = React.useMemo(() => renderAvatarSvg(recipe, 512), [recipe]);
  const vars = React.useMemo(() => cssVars(recipe), [recipe]);

  async function handleSave() {
    if (!onSave) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      await onSave(recipe);
      setSaveMsg("Saved!");
      window.setTimeout(() => setSaveMsg(null), 1200);
    } catch (e: any) {
      setSaveMsg(e?.message ? `Error: ${e.message}` : "Error saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "calc(100vh - 64px)", // adjust/remove if your header differs
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {/* TOP: Avatar preview (fills top ~60% of screen) */}
      <div
        style={{
          height: "60vh",
          minHeight: 360,
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 16,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {/* Centered + scaled avatar (200% increase), proportional */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              width: 512,
              height: 512,
              transform: "scale(2)", // ✅ 200% bigger
              transformOrigin: "center",
              ...(vars as any),
            }}
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        </div>

        {/* Save button */}
        <div style={{ position: "absolute", right: 12, bottom: 12, display: "flex", gap: 10 }}>
          {saveMsg ? (
            <div
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                fontSize: 13,
                opacity: 0.9,
              }}
            >
              {saveMsg}
            </div>
          ) : null}

          <button
            onClick={handleSave}
            disabled={!onSave || saving}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--bg)",
              color: "var(--text)",
              cursor: saving ? "default" : "pointer",
              opacity: saving ? 0.7 : 1,
              fontWeight: 600,
            }}
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* BOTTOM: Sliders */}
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
