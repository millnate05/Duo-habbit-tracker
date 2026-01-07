"use client";

import React from "react";
import type { AvatarRecipe } from "@/engine/avatar/types";
import { renderAvatarSvg } from "@/engine/avatar/render";

export function AvatarPreview({
  recipe,
  size = 260,
}: {
  recipe: AvatarRecipe;
  size?: number;
}) {
  const svg = React.useMemo(() => renderAvatarSvg(recipe), [recipe]);

  return (
    <div
      style={{
        width: size,
        height: size * 1.4,
        borderRadius: 16,
        border: "1px solid var(--border)",
        background: "var(--bg)",
        display: "grid",
        placeItems: "center",
        overflow: "hidden",
      }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

