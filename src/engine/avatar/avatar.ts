// src/engine/avatar/avatar.ts
// Single-file avatar engine (v3.6)
// - Keeps head morphing exactly as before
// - Hair constraints updated per feedback:
//   1) Clean curved forehead hairline ~25% higher
//   2) Right side becomes a small uniform "sideburn" (reduce protrusion ~80%)
//   3) Left side has 3 distinct outward chunks with different lengths
// - Outline masked under hair so no harsh head outline in hair region

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
    redBase: "#D44A2A",
    redShadow: "#B5381F",
    redDeep: "#8F2A17",
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

// ✅ Perfect default head
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

function morphedHeadPath(recipe: AvatarRecipe): string {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const cheekWidth = clamp(recipe.cheekWidth, 0.5, 1.5);
  const jawWidth = clamp(recipe.jawWidth, 0.5, 1.5);

  if (faceLength === 1 && cheekWidth === 1 && jawWidth === 1) return PERFECT_DEFAULT_D;

  const cx = 256;
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;

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

function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

/**
 * NEW constrained hair:
 * - Forehead line is a clean arc (higher than before)
 * - Right side is a small uniform sideburn (minimal protrusion)
 * - Left side has 3 outward chunks (distinct lengths)
 */
function constrainedHair(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);

  const yTop = 84;
  const yBottom = 372;
  const H = yBottom - yTop;

  // Forehead hairline: set higher (smaller ratio = higher up on face)
  // Old-ish feel was ~0.25. Now we go ~0.19 (~25% higher).
  const yHairline = ty(yTop + H * 0.19);

  // Crown/top lift
  const yCrown = ty(yTop - H * 0.10);

  // Head-ish bounds for hair placement (designer constants)
  const cx = 256;

  // LEFT chunk lengths (sticking out)
  const xLeftBase = 166; // near where head would be
  const xLeft1 = xLeftBase - 44; // longest
  const xLeft2 = xLeftBase - 30; // medium
  const xLeft3 = xLeftBase - 18; // shortest

  // RIGHT sideburn: reduce protrusion by ~80%
  // Previously we were out around ~420–440. Now keep it close to head (~372–380).
  const xRightInner = 344;
  const xRightOuter = 372; // small protrusion, "straight" edge feel

  // ------------------------
  // BACK mass (kept subtle so it doesn't blob)
  // ------------------------
  const back = `
    M 170 ${ty(160)}
    C 176 ${ty(118)} 210 ${ty(84)} ${cx - 16} ${yCrown}
    C ${cx + 50} ${yCrown} 350 ${ty(112)} 366 ${ty(148)}
    C 378 ${ty(174)} 374 ${ty(206)} 354 ${ty(222)}
    C 334 ${ty(236)} 306 ${ty(232)} 284 ${ty(224)}
    C 260 ${ty(216)} 236 ${ty(220)} 216 ${ty(232)}
    C 194 ${ty(246)} 170 ${ty(232)} 164 ${ty(206)}
    C 156 ${ty(182)} 162 ${ty(170)} 170 ${ty(160)}
    Z
  `.replace(/\s+/g, " ").trim();

  // ------------------------
  // FRONT: clean curved forehead line + right sideburn + left 3 chunks
  // We build this as ONE main shape + 3 left chunk overlays for clean silhouette.
  // ------------------------

  // Main front (includes the clean arc hairline + right sideburn edge)
  const frontMain = `
    M ${xLeftBase} ${ty(150)}
    C 200 ${ty(116)} 288 ${ty(112)} 332 ${ty(128)}
    C 352 ${ty(136)} ${xRightOuter} ${ty(150)} ${xRightOuter} ${ty(176)}
    C ${xRightOuter} ${ty(198)} ${xRightOuter} ${ty(222)} ${xRightInner} ${ty(230)}
    C 336 ${ty(236)} 326 ${ty(224)} 318 ${ty(210)}
    C 300 ${ty(228)} 276 ${ty(240)} 252 ${ty(236)}
    C 224 ${ty(230)} 204 ${ty(234)} 190 ${ty(244)}
    C 172 ${ty(258)} 158 ${ty(244)} 160 ${ty(222)}
    C 162 ${ty(204)} 162 ${ty(186)} ${xLeftBase} ${ty(172)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Hairline “cut” arc guide (we’ll use it for seams/highlights placement)
  // This is the clean slightly-curved line across the forehead.
  const hairlineArc = `
    M 168 ${yHairline}
    C 214 ${yHairline + 10} 298 ${yHairline + 10} 348 ${yHairline}
  `.replace(/\s+/g, " ").trim();

  // Left chunks: three distinct outward clumps at different lengths.
  // These are designed to overlap the main front and create a jagged silhouette.
  const chunk1 = `
    M ${xLeftBase} ${ty(160)}
    C ${xLeft1} ${ty(150)} ${xLeft1} ${ty(182)} ${xLeftBase} ${ty(176)}
    C ${xLeftBase - 6} ${ty(172)} ${xLeftBase - 6} ${ty(166)} ${xLeftBase} ${ty(160)}
    Z
  `.replace(/\s+/g, " ").trim();

  const chunk2 = `
    M ${xLeftBase + 6} ${ty(178)}
    C ${xLeft2} ${ty(170)} ${xLeft2} ${ty(198)} ${xLeftBase + 6} ${ty(194)}
    C ${xLeftBase} ${ty(192)} ${xLeftBase} ${ty(184)} ${xLeftBase + 6} ${ty(178)}
    Z
  `.replace(/\s+/g, " ").trim();

  const chunk3 = `
    M ${xLeftBase + 14} ${ty(198)}
    C ${xLeft3} ${ty(192)} ${xLeft3} ${ty(214)} ${xLeftBase + 14} ${ty(212)}
    C ${xLeftBase + 10} ${ty(210)} ${xLeftBase + 10} ${ty(202)} ${xLeftBase + 14} ${ty(198)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Seam valleys near left chunks (to emphasize 3-piece separation)
  const seamL1 = `
    M ${xLeftBase + 6} ${ty(172)}
    C ${xLeftBase - 14} ${ty(172)} ${xLeftBase - 10} ${ty(186)} ${xLeftBase + 10} ${ty(186)}
    C ${xLeftBase + 16} ${ty(186)} ${xLeftBase + 16} ${ty(176)} ${xLeftBase + 6} ${ty(172)}
    Z
  `.replace(/\s+/g, " ").trim();

  const seamL2 = `
    M ${xLeftBase + 10} ${ty(192)}
    C ${xLeftBase - 10} ${ty(192)} ${xLeftBase - 8} ${ty(204)} ${xLeftBase + 12} ${ty(206)}
    C ${xLeftBase + 18} ${ty(206)} ${xLeftBase + 18} ${ty(196)} ${xLeftBase + 10} ${ty(192)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Highlights: keep them simple so shape reads first
  const hi1 = `
    M 198 ${ty(156)}
    C 224 ${ty(134)} 266 ${ty(126)} 300 ${ty(132)}
    C 270 ${ty(144)} 238 ${ty(152)} 214 ${ty(170)}
    C 206 ${ty(178)} 190 ${ty(170)} 198 ${ty(156)}
    Z
  `.replace(/\s+/g, " ").trim();

  const hi2 = `
    M 292 ${ty(140)}
    C 316 ${ty(132)} 342 ${ty(138)} 356 ${ty(154)}
    C 336 ${ty(154)} 318 ${ty(164)} 304 ${ty(178)}
    C 296 ${ty(184)} 284 ${ty(168)} 292 ${ty(140)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Outline cover mask: covers head outline where hair sits
  const outlineCover = `
    M 96 ${ty(88)}
    C 168 ${yCrown} 344 ${yCrown} 416 ${ty(88)}
    C 456 ${ty(128)} 452 ${ty(220)} 256 ${ty(220)}
    C 60 ${ty(220)} 56 ${ty(128)} 96 ${ty(88)}
    Z
  `.replace(/\s+/g, " ").trim();

  return {
    back,
    frontMain,
    chunks: { chunk1, chunk2, chunk3 },
    seams: { seamL1, seamL2 },
    his: { hi1, hi2 },
    outlineCover,
    hairlineArc,
  };
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hair = constrainedHair(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>

    <mask id="maskOutlineUnderHair">
      <rect x="0" y="0" width="512" height="512" fill="white" />
      <path d="${hair.outlineCover}" fill="black" />
    </mask>
  </defs>

  <!-- 1) Head fill -->
  <g id="head-fill">
    <path fill="var(--skin)" d="${headD}" />
  </g>

  <!-- 2) Back hair (subtle) -->
  <g id="hair-back">
    <path fill="var(--hair)" d="${hair.back}" />
    <path fill="${PALETTE.hair.redShadow}" opacity="0.18" d="${hair.back}" />
  </g>

  <!-- 3) Front hair (clipped to head) -->
  <g id="hair-front" clip-path="url(#clipHead)">
    <!-- main front mass -->
    <path fill="var(--hair)" d="${hair.frontMain}" />

    <!-- left chunks (3 distinct outward bits) -->
    <path fill="var(--hair)" d="${hair.chunks.chunk1}" />
    <path fill="var(--hair)" d="${hair.chunks.chunk2}" />
    <path fill="var(--hair)" d="${hair.chunks.chunk3}" />

    <!-- seam valleys to emphasize chunk separation -->
    <path fill="${PALETTE.hair.redDeep}" opacity="0.26" d="${hair.seams.seamL1}" />
    <path fill="${PALETTE.hair.redDeep}" opacity="0.24" d="${hair.seams.seamL2}" />

    <!-- subtle hairline stroke to enforce the clean curved forehead line -->
    <path d="${hair.hairlineArc}" stroke="${PALETTE.hair.redDeep}" stroke-width="4" opacity="0.18" fill="none" stroke-linecap="round" />

    <!-- highlights -->
    <path fill="${PALETTE.hair.redHi}" d="${hair.his.hi1}" />
    <path fill="${PALETTE.hair.redHi2}" d="${hair.his.hi2}" />
  </g>

  <!-- 4) Head outline (masked so it vanishes under hair) -->
  <g id="head-outline" mask="url(#maskOutlineUnderHair)">
    <path class="ol" fill="none" d="${headD}" />
  </g>
</svg>
`.trim();
}
