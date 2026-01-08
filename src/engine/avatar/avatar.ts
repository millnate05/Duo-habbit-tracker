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

  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const cheek = clamp(recipe.cheekWidth, 0.5, 1.5);
  const jaw = clamp(recipe.jawWidth, 0.5, 1.5);

  // Vertical landmarks (base)
  const yTop = 84;
  const yTemple = 132;
  const yCheek = 220;
  const yJaw = 304;
  const yChin = 372;

  // Scale vertically around center
  const cy = (yTop + yChin) / 2;
  const sy = (y: number) => cy + (y - cy) * faceLength;

  const YT = sy(yTop);
  const YTe = sy(yTemple);
  const YC = sy(yCheek);
  const YJ = sy(yJaw);
  const YCh = sy(yChin);

  // Half-widths (base)
  const wTempleBase = 76;
  const wCheekBase = 108;
  const wJawBase = 84;
  const wChinBase = 42;

  // Apply scaling
  const wTemple = wTempleBase * (0.75 * cheek + 0.25 * jaw);
  const wCheek = wCheekBase * cheek;
  const wJaw = wJawBase * jaw;
  const wChin = wChinBase * jaw;

  // X positions
  const xTempleL = cx - wTemple;
  const xCheekL = cx - wCheek;
  const xJawL = cx - wJaw;
  const xChinL = cx - wChin;

  const xTempleR = cx + wTemple;
  const xCheekR = cx + wCheek;
  const xJawR = cx + wJaw;
  const xChinR = cx + wChin;

  // Curvature tuning (prevents “hair tufts”)
  const topBulge = 24;
  const cheekBulge = 30;
  const jawBulge = 22;
  const chinBulge = 18;

  const d = `
    M ${cx} ${YT}
    C ${cx + topBulge} ${YT} ${xTempleR} ${YTe - 28} ${xTempleR} ${YTe}
    C ${xTempleR} ${YTe + 46} ${xCheekR} ${YC - cheekBulge} ${xCheekR} ${YC}
    C ${xCheekR} ${YC + cheekBulge} ${xJawR} ${YJ - jawBulge} ${xJawR} ${YJ}
    C ${xJawR} ${YJ + 46} ${xChinR} ${YCh - chinBulge} ${cx} ${YCh}
    C ${xChinL} ${YCh - chinBulge} ${xJawL} ${YJ + 46} ${xJawL} ${YJ}
    C ${xJawL} ${YJ - jawBulge} ${xCheekL} ${YC + cheekBulge} ${xCheekL} ${YC}
    C ${xCheekL} ${YC - cheekBulge} ${xTempleL} ${YTe + 46} ${xTempleL} ${YTe}
    C ${xTempleL} ${YTe - 28} ${cx - topBulge} ${YT} ${cx} ${YT}
    Z
  `;

  return d.replace(/\s+/g, " ").trim();
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
