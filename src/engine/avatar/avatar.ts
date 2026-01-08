// src/engine/avatar/avatar.ts
// Single-file avatar engine (v3)
// - Preserves the "perfect" default head path exactly at 1/1/1
// - Sliders morph that SAME path (no silhouette change at default)
// - Cheek influence shifted ~10% lower (0.45 -> 0.55)
// - Adds a crew cut hair cap clipped to the head so it hugs perfectly
// - Correct draw order so hair is visible (head fill -> hair -> outline)

export type AvatarRecipe = {
  skinTone: "olive";
  faceLength: number; // 0.5–1.5
  cheekWidth: number; // 0.5–1.5
  jawWidth: number; // 0.5–1.5
  hair: "crewcut";
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
  faceLength: 1,
  cheekWidth: 1,
  jawWidth: 1,
  hair: "crewcut",
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: { olive: "#C8A07A" } as const,
  hair: {
    crew: "#2B201A",
    crewHi: "rgba(255,255,255,0.08)",
  } as const,
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--skin": PALETTE.skin[recipe.skinTone],
    "--hair": PALETTE.hair.crew,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ✅ Put your exact “perfect” default head path here if it differs.
// This is the one that should render when sliders are all 1.0.
const PERFECT_DEFAULT_D = `
M 256 84
C 214 84 182 108 170 144
C 156 188 160 244 174 288
C 188 332 218 364 256 372
C 294 364 324 332 338 288
C 352 244 356 188 342 144
C 330 108 298 84 256 84
Z
`.replace(/\s+/g, " ").trim();

function fmt(n: number) {
  return Number(n.toFixed(2)).toString();
}

/**
 * Morph the PERFECT_DEFAULT_D by scaling:
 * - Y around face center (faceLength)
 * - X around centerline using cheek/jaw weights based on Y position
 *
 * If recipe is default (1/1/1), returns PERFECT_DEFAULT_D exactly.
 */
function morphedHeadPath(recipe: AvatarRecipe): string {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const cheekWidth = clamp(recipe.cheekWidth, 0.5, 1.5);
  const jawWidth = clamp(recipe.jawWidth, 0.5, 1.5);

  if (faceLength === 1 && cheekWidth === 1 && jawWidth === 1) {
    return PERFECT_DEFAULT_D;
  }

  const cx = 256;

  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;

  // Cheek influence moved ~10% lower: peak 0.45 -> 0.55
  const weightAtY = (y: number) => {
    const t = clamp((y - yTop) / (yBottom - yTop), 0, 1);

    // Cheek peak lower
    const cheekW = Math.exp(-Math.pow((t - 0.55) / 0.22, 2));
    // Jaw increases toward bottom
    const jawW = Math.pow(t, 2.4);

    const sum = cheekW + jawW || 1;
    return { cheekW: cheekW / sum, jawW: jawW / sum };
  };

  const tx = (x: number, y: number) => {
    const { cheekW, jawW } = weightAtY(y);
    const scaleX = cheekW * cheekWidth + jawW * jawWidth;
    return cx + (x - cx) * scaleX;
  };

  const ty = (y: number) => cy + (y - cy) * faceLength;

  // Tokenize the path and transform coordinate pairs
  const tokens = PERFECT_DEFAULT_D.split(/(\s+|,)/).filter((t) => t !== "" && t !== " ");
  const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(s);

  let expectingCoord = false;
  let coordIndex = 0; // 0 => x, 1 => y
  let lastX = 0;
  let lastY = 0;

  const out: string[] = [];

  for (const t of tokens) {
    if (!isNum(t)) {
      if (/^[A-Za-z]$/.test(t)) {
        expectingCoord = /[MC]/.test(t); // this path uses M and C
        coordIndex = 0;
      }
      out.push(t);
      continue;
    }

    const n = Number(t);

    if (expectingCoord) {
      if (coordIndex === 0) {
        lastX = n;
        coordIndex = 1;
        out.push("__X__");
      } else {
        lastY = n;
        coordIndex = 0;

        const newX = tx(lastX, lastY);
        const newY = ty(lastY);

        const xi = out.lastIndexOf("__X__");
        if (xi >= 0) out[xi] = fmt(newX);
        out.push(fmt(newY));
      }
    } else {
      out.push(t);
    }
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Crew cut hair “cap”:
 * - clipped to head, so it will always hug the silhouette
 * - hairline moves with faceLength so it stays natural as face gets taller/shorter
 *
 * IMPORTANT: We intentionally don't try to “match” cheeks/jaw here;
 * the clipPath takes care of perfect fit.
 */
function crewCutHairPath(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);

  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  const ty = (y: number) => cy + (y - cy) * faceLength;

  // Hairline ~33% down from top
  const hairlineY = ty(yTop + (yBottom - yTop) * 0.33);

  // Oversized cap; clip trims it to head
  const d = `
    M 88 ${ty(44)}
    C 160 ${ty(18)} 352 ${ty(18)} 424 ${ty(44)}
    C 452 ${ty(98)} 430 ${hairlineY} 256 ${hairlineY}
    C 82 ${hairlineY} 60 ${ty(98)} 88 ${ty(44)}
    Z
  `;
  return d.replace(/\s+/g, " ").trim();
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hairD = crewCutHairPath(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>
  </defs>

  <!-- 1) Head fill FIRST -->
  <g id="head-fill">
    <path fill="var(--skin)" d="${headD}" />
  </g>

  <!-- 2) Hair (clipped to head so it hugs perfectly) -->
  <g id="hair" clip-path="url(#clipHead)">
    <path fill="var(--hair)" d="${hairD}" />
    <!-- Subtle highlight band to make it read like hair (still clipped) -->
    <path
      fill="${PALETTE.hair.crewHi}"
      d="
        M 144 120
        C 214 88 298 88 368 120
        C 314 110 198 110 144 120
        Z
      "
      clip-path="url(#clipHead)"
    />
  </g>

  <!-- 3) Outline LAST (stroke only) -->
  <g id="head-outline">
    <path class="ol" fill="none" d="${headD}" />
  </g>
</svg>
`.trim();
}
