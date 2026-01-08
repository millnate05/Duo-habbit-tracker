// src/engine/avatar/avatar.ts
// Single-file avatar engine (v3.2)
// - Preserves the "perfect" default head path exactly at 1/1/1
// - Sliders morph that SAME path (no silhouette change at default)
// - Cheek influence shifted ~10% lower (0.45 -> 0.55)
// - NEW hair: side-swept red style (reference-matching)
//   - back layer (not clipped) for volume
//   - front layer (clipped) for clean hairline/fringe
//   - warm red palette + shadow + highlight streaks
// - Correct draw order: head fill -> back hair -> front hair -> outline

export type AvatarRecipe = {
  skinTone: "olive";
  faceLength: number; // 0.5–1.5
  cheekWidth: number; // 0.5–1.5
  jawWidth: number; // 0.5–1.5
  hair: "sweptRed";
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
  faceLength: 1,
  cheekWidth: 1,
  jawWidth: 1,
  hair: "sweptRed",
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: { olive: "#C8A07A" } as const,
  hair: {
    // Target-ish warm red (base + shadow + highlight)
    redBase: "#D44A2A",
    redShadow: "#B5381F",
    redHi: "rgba(255,255,255,0.18)",
    redHi2: "rgba(255,255,255,0.10)",
  } as const,
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--skin": PALETTE.skin[recipe.skinTone],
    "--hair": PALETTE.hair.redBase,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

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
    const cheekW = Math.exp(-Math.pow((t - 0.55) / 0.22, 2));
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

  const tokens = PERFECT_DEFAULT_D.split(/(\s+|,)/).filter((t) => t !== "" && t !== " ");
  const isNum = (s: string) => /^-?\d+(\.\d+)?$/.test(s);

  let expectingCoord = false;
  let coordIndex = 0;
  let lastX = 0;
  let lastY = 0;

  const out: string[] = [];

  for (const t of tokens) {
    if (!isNum(t)) {
      if (/^[A-Za-z]$/.test(t)) {
        expectingCoord = /[MC]/.test(t);
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
 * Hair helper: lets us shift key Y coordinates with faceLength,
 * so hair stays in the right place as head gets taller/shorter.
 */
function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

/**
 * SIDE-SWEPT RED HAIR (reference-like):
 * - Back mass: provides the “big red shape” behind top/side (NOT clipped)
 * - Front mass: fringe + swoop (CLIPPED) so it sits cleanly on forehead/head
 * - Shadow wedge: adds separation/depth near the part
 * - Highlight streaks: gives that “cartoon hair strands” look
 */
function sweptRedHairPaths(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);

  // Hairline region (roughly where forehead begins)
  const hairlineY = ty(140);

  // Back hair (volume behind head)
  // This is intentionally oversized; it will read like the reference “cap with lift”.
  const back = `
    M 138 ${ty(132)}
    C 150 ${ty(96)} 206 ${ty(70)} 270 ${ty(78)}
    C 334 ${ty(86)} 390 ${ty(112)} 408 ${ty(150)}
    C 418 ${ty(176)} 416 ${ty(212)} 394 ${ty(232)}
    C 372 ${ty(252)} 338 ${ty(236)} 300 ${ty(224)}
    C 262 ${ty(212)} 226 ${ty(212)} 194 ${ty(226)}
    C 154 ${ty(244)} 126 ${ty(214)} 122 ${ty(182)}
    C 118 ${ty(160)} 126 ${ty(146)} 138 ${ty(132)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Front swoop/fringe (clipped)
  // Key features:
  // - big swoop from left -> right
  // - small “tuft” on the right side
  // - soft dip hairline in the middle
  const front = `
    M 150 ${ty(150)}
    C 178 ${ty(112)} 242 ${ty(92)} 300 ${ty(104)}
    C 350 ${ty(114)} 384 ${ty(140)} 386 ${ty(166)}
    C 388 ${ty(190)} 368 ${ty(206)} 346 ${ty(202)}
    C 330 ${ty(200)} 320 ${ty(188)} 312 ${ty(176)}
    C 300 ${ty(194)} 278 ${ty(204)} 252 ${hairlineY}
    C 222 ${ty(192)} 192 ${ty(194)} 174 ${ty(206)}
    C 156 ${ty(216)} 142 ${ty(198)} 146 ${ty(178)}
    C 148 ${ty(166)} 148 ${ty(158)} 150 ${ty(150)}
    Z

    M 356 ${ty(156)}
    C 388 ${ty(154)} 404 ${ty(172)} 396 ${ty(198)}
    C 388 ${ty(228)} 350 ${ty(222)} 346 ${ty(202)}
    C 360 ${ty(202)} 372 ${ty(190)} 374 ${ty(176)}
    C 376 ${ty(164)} 368 ${ty(158)} 356 ${ty(156)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Shadow wedge near “part” area (adds depth like reference’s darker arc)
  const shadow = `
    M 190 ${ty(144)}
    C 220 ${ty(116)} 286 ${ty(110)} 332 ${ty(132)}
    C 306 ${ty(132)} 252 ${ty(144)} 216 ${ty(166)}
    C 202 ${ty(174)} 188 ${ty(164)} 190 ${ty(144)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Two highlight streak shapes (cartoony strand separation)
  const hi1 = `
    M 176 ${ty(140)}
    C 210 ${ty(110)} 260 ${ty(104)} 302 ${ty(118)}
    C 266 ${ty(118)} 224 ${ty(130)} 196 ${ty(152)}
    C 184 ${ty(160)} 170 ${ty(154)} 176 ${ty(140)}
    Z
  `.replace(/\s+/g, " ").trim();

  const hi2 = `
    M 276 ${ty(120)}
    C 306 ${ty(106)} 346 ${ty(114)} 364 ${ty(134)}
    C 340 ${ty(132)} 312 ${ty(140)} 292 ${ty(154)}
    C 280 ${ty(162)} 266 ${ty(148)} 276 ${ty(120)}
    Z
  `.replace(/\s+/g, " ").trim();

  return { back, front, shadow, hi1, hi2 };
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const { back, front, shadow, hi1, hi2 } = sweptRedHairPaths(recipe);

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

  <!-- 2) Hair back layer (NOT clipped) for volume like the reference -->
  <g id="hair-back">
    <path fill="var(--hair)" d="${back}" />
  </g>

  <!-- 3) Hair front layer (CLIPPED) so hairline/fringe sits cleanly -->
  <g id="hair-front" clip-path="url(#clipHead)">
    <path fill="var(--hair)" d="${front}" />

    <!-- Depth/shadow near the part -->
    <path fill="${PALETTE.hair.redShadow}" opacity="0.55" d="${shadow}" />

    <!-- Highlights / strand separation -->
    <path fill="${PALETTE.hair.redHi}" d="${hi1}" />
    <path fill="${PALETTE.hair.redHi2}" d="${hi2}" />
  </g>

  <!-- 4) Outline LAST (stroke only) -->
  <g id="head-outline">
    <path class="ol" fill="none" d="${headD}" />
  </g>
</svg>
`.trim();
}
