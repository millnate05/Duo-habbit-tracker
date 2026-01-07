"use client";

import React from "react";
import type { AvatarRecipe } from "@/engine/avatar/types";
import { renderAvatarSvg } from "@/engine/avatar/render";

export function AvatarPreview({
  recipe,
  size = 300,
}: {
  recipe: AvatarRecipe;
  size?: number;
}) {
  const svg = React.useMemo(() => renderAvatarSvg(recipe), [recipe]);

  return (
    <div
      style={{
        width: size,
        height: Math.round(size * 1.15),
        borderRadius: 20,
        border: "1px solid var(--border)",
        background:
          "radial-gradient(120% 120% at 30% 15%, rgba(255,255,255,0.10), rgba(0,0,0,0.0)), var(--bg)",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
