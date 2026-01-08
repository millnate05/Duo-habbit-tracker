// src/engine/avatar/avatar.ts
// Single-file avatar engine (v1): smooth face silhouette + sliders for proportions

export type AvatarRecipe = {
  skinTone: "olive";
  // 0.5 = 50% smaller, 1 = default, 1.5 = 50% bigger
  faceLength: number; // scales vertical proportions
  cheekWidth: number; // scales midface width
  jawWidth: number; // scales lower-face width
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
  faceLength: 1,
  cheekWidth: 1,
  jawWidth: 1,
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: {
    olive: "#C8A07A",
  } as const,
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--skin": PALETTE.skin[recipe.skinTone],
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * Build a smooth, symmetric head silhouette from 3 parameters.
 * We generate a cubic-bezier path around a centerline.
 */
function buildHeadPath(recipe: AvatarRecipe) {
  const cx = 256;

  // Clamp for safety (in case old saved data is weird)
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const cheek = clamp(recipe.cheekWidth, 0.5, 1.5);
  const jaw = clamp(recipe.jawWidth, 0.5, 1.5);

  // Base vertical landmarks (default head)
  const yTop = 84;
  const yTemple = 130;
  const yCheek = 210;
  const yJaw = 300;
  const yChin = 372;

  // Scale vertical positions around a center so it lengthens/shortens naturally
  const cy = (yTop + yChin) / 2; // 228
  const sy = (y: number) => cy + (y - cy) * faceLength;

  const YT = sy(yTop);
  const YTe = sy(yTemple);
  const YC = sy(yCheek);
  const YJ = sy(yJaw);
  const YCh = sy(yChin);

  // Base half-widths at key landmarks
  // (These numbers are tuned to look good at default = 1)
  const wTempleBase = 78;
  const wCheekBase = 106;
  const wJawBase = 82;
  const wChinBase = 40;

  // Apply width scaling
  const wTemple = wTempleBase * (0.65 * cheek + 0.35 * jaw);
  const wCheek = wCheekBase * cheek;
  const wJaw = wJawBase * jaw;
  const wChin = wChinBase * jaw;

  // Left side X values
  const xTempleL = cx - wTemple;
  const xCheekL = cx - wCheek;
  const xJawL = cx - wJaw;
  const xChinL = cx - wChin;

  // Right side X values
  const xTempleR = cx + wTemple;
  const xCheekR = cx + wCheek;
  const xJawR = cx + wJaw;
  const xChinR = cx + wChin;

  // Control-point helpers for smoothness
  // We keep the silhouette “oval but defined” without adding any shading.
  const cTopOut = 18; // how rounded the top is
  const cSide = 26; // side curvature strength
  const cJaw = 22; // jaw corner softness
  const cChin = 20; // chin roundness

  // Build a single closed path:
  // top -> right temple -> right cheek -> right jaw -> chin -> left jaw -> left cheek -> left temple -> top
  return `
    M ${cx} ${YT}
    C ${cx + cTopOut} ${YT} ${xTempleR + cSide} ${YTe - 8} ${xTempleR} ${YTe}
    C ${xCheekR} ${YC - 34} ${xCheekR} ${YC + 18} ${xCheekR - 2} ${YC}
    C ${xJawR + cJaw} ${YJ - 6} ${xJawR + cJaw} ${YJ + 36} ${xJawR} ${YJ}
    C ${xChinR - 4} ${YCh - cChin} ${cx + cChin} ${YCh} ${cx} ${YCh}
    C ${cx - cChin} ${YCh} ${xChinL + 4} ${YCh - cChin} ${xJawL} ${YJ}
    C ${xJawL - cJaw} ${YJ + 36} ${xJawL - cJaw} ${YJ - 6} ${xCheekL + 2} ${YC}
    C ${xCheekL} ${YC + 18} ${xCheekL} ${YC - 34} ${xTempleL} ${YTe}
    C ${xTempleL - cSide} ${YTe - 8} ${cx - cTopOut} ${YT} ${cx} ${YT}
    Z
  `.replace(/\s+/g, " ").trim();
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const d = buildHeadPath(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  </style>

  <g id="base-head">
    <path class="ol" fill="var(--skin)" d="${d}" />
  </g>
</svg>
`.trim();
}
