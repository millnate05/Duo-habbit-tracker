// src/engine/avatar/avatar.ts
// Single-file avatar engine (v3.5)
// - Preserves the "perfect" default head path exactly at 1/1/1
// - Sliders morph that SAME path (no silhouette change at default)
// - Cheek influence shifted ~10% lower (0.45 -> 0.55)
// - Hair rebuilt around PARAMS (ratio-based) to iterate toward the reference red style:
//   - Back hair (not clipped) for volume + right puff
//   - Front hair = 3 overlapping clumps (clipped to head)
//   - “Chunk” definition = seam valley shapes + optional seam strokes (no random blobs)
//   - Head outline masked out under hair (shape mask, not a rectangle)

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

// ✅ Put your exact “perfect” default head path here if it differs.
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

  if (faceLength === 1 && cheekWidth === 1 && jawWidth === 1) {
    return PERFECT_DEFAULT_D;
  }

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

/** Keep Y placements stable as faceLength changes */
function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

/**
 * Parameterized hair ratios (based on the target style).
 * All Y ratios are relative to head height H = yBottom - yTop.
 */
const HAIR = {
  // Big shape
  crownLift: 0.10, // how far above head-top the hair crown rises
  hairlineCenter: 0.25, // center hairline dip
  hairlineSide: 0.21, // left/right hairline
  hairlineRightLift: 0.03, // make right side slightly higher than center dip

  // Right puff lobe
  puffTop: 0.08,
  puffBottom: 0.52,
  puffOut: 0.34, // how far the puff pushes out horizontally

  // Chunk separation
  seamOpacity: 0.22,
  seamStrokeOpacity: 0.20,
} as const;

function sweptRedHair(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);

  const yTop = 84;
  const yBottom = 372;
  const H = yBottom - yTop; // 288
  const cx = 256;

  // Helpers: ratio -> real y, then faceLength-adjusted y
  const yr = (r: number) => ty(yTop + H * r);

  // Anchor Y positions
  const yCrown = ty(yTop - H * HAIR.crownLift); // above head
  const yHairlineC = yr(HAIR.hairlineCenter);
  const yHairlineL = yr(HAIR.hairlineSide);
  const yHairlineR = yr(HAIR.hairlineCenter - HAIR.hairlineRightLift);

  const yPuffTop = yr(HAIR.puffTop);
  const yPuffBot = yr(HAIR.puffBottom);

  // Horizontal anchors (tuned for the 512 viewBox)
  // These are intentionally “design constants” you can tweak as we iterate.
  const xL = 138;
  const xR = 398;
  const xPuff = clamp(cx + 160 * HAIR.puffOut, 380, 450); // ~410–440

  // ----------------------------
  // BACK HAIR (volume + puff)
  // NOT clipped to head.
  // The goal: peaks/valleys so it stops looking like a helmet.
  // ----------------------------
  const back = `
    M ${xL} ${yr(0.30)}
    C ${xL - 10} ${yr(0.18)} ${xL + 18} ${yr(0.08)} ${cx - 40} ${yCrown}
    C ${cx + 10} ${yCrown} ${xR - 10} ${yr(0.10)} ${xR + 18} ${yr(0.22)}
    C ${xPuff + 10} ${yPuffTop} ${xPuff + 18} ${yr(0.36)} ${xPuff - 8} ${yPuffBot}
    C ${xR - 8} ${yr(0.62)} ${cx + 40} ${yr(0.58)} ${cx + 22} ${yr(0.54)}
    C ${cx} ${yr(0.58)} ${cx - 40} ${yr(0.60)} ${cx - 70} ${yr(0.64)}
    C ${cx - 96} ${yr(0.68)} ${xL - 4} ${yr(0.60)} ${xL - 6} ${yr(0.44)}
    C ${xL - 8} ${yr(0.36)} ${xL + 4} ${yr(0.34)} ${xL} ${yr(0.30)}
    Z
  `.replace(/\s+/g, " ").trim();

  // ----------------------------
  // FRONT HAIR = 3 CLUMPS (overlap)
  // Clipped to head so it never enters the face.
  // Each clump has its own silhouette so the “chunk” read is natural.
  // ----------------------------

  // Left clump
  const frontL = `
    M 150 ${yr(0.34)}
    C 168 ${yr(0.24)} 204 ${yr(0.18)} 238 ${yr(0.20)}
    C 216 ${yr(0.24)} 194 ${yr(0.30)} 190 ${yr(0.38)}
    C 186 ${yr(0.46)} 160 ${yr(0.46)} 150 ${yr(0.40)}
    C 146 ${yr(0.38)} 146 ${yr(0.36)} 150 ${yr(0.34)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Main swoop clump
  const frontM = `
    M 184 ${yr(0.34)}
    C 214 ${yr(0.22)} 274 ${yr(0.16)} 328 ${yr(0.20)}
    C 300 ${yr(0.22)} 276 ${yr(0.28)} 262 ${yr(0.34)}
    C 246 ${yr(0.42)} 214 ${yr(0.48)} 190 ${yr(0.46)}
    C 178 ${yr(0.44)} 176 ${yr(0.38)} 184 ${yr(0.34)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Right clump + connects toward puff
  const frontR = `
    M 268 ${yr(0.33)}
    C 304 ${yr(0.22)} 356 ${yr(0.24)} 380 ${yr(0.32)}
    C 394 ${yr(0.38)} 392 ${yr(0.46)} 372 ${yr(0.46)}
    C 352 ${yr(0.46)} 336 ${yr(0.40)} 326 ${yr(0.36)}
    C 312 ${yr(0.42)} 292 ${yr(0.48)} 270 ${yr(0.44)}
    C 258 ${yr(0.42)} 258 ${yr(0.37)} 268 ${yr(0.33)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Right tuft (separate chunk that sits over the side/puff area)
  const tuft = `
    M 356 ${yr(0.25)}
    C ${xPuff} ${yr(0.23)} ${xPuff + 18} ${yr(0.32)} ${xPuff - 2} ${yr(0.40)}
    C ${xPuff - 18} ${yr(0.50)} 352 ${yr(0.50)} 350 ${yr(0.42)}
    C 348 ${yr(0.34)} 352 ${yr(0.28)} 356 ${yr(0.25)}
    Z
  `.replace(/\s+/g, " ").trim();

  // ----------------------------
  // Seam valleys (filled shapes) to sell chunk separation
  // These are NOT skin holes; they're subtle darker “valleys”.
  // ----------------------------
  const seam1 = `
    M 206 ${yr(0.41)}
    C 228 ${yr(0.30)} 254 ${yr(0.26)} 284 ${yr(0.27)}
    C 262 ${yr(0.30)} 244 ${yr(0.36)} 232 ${yr(0.43)}
    C 224 ${yr(0.48)} 202 ${yr(0.46)} 206 ${yr(0.41)}
    Z
  `.replace(/\s+/g, " ").trim();

  const seam2 = `
    M 286 ${yr(0.40)}
    C 308 ${yr(0.31)} 336 ${yr(0.30)} 360 ${yr(0.35)}
    C 340 ${yr(0.35)} 324 ${yr(0.39)} 312 ${yr(0.44)}
    C 304 ${yr(0.48)} 280 ${yr(0.46)} 286 ${yr(0.40)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Highlights: chunky arcs that follow the hair flow
  const hi1 = `
    M 176 ${yr(0.39)}
    C 198 ${yr(0.28)} 232 ${yr(0.23)} 262 ${yr(0.25)}
    C 238 ${yr(0.29)} 216 ${yr(0.34)} 200 ${yr(0.41)}
    C 192 ${yr(0.45)} 170 ${yr(0.44)} 176 ${yr(0.39)}
    Z
  `.replace(/\s+/g, " ").trim();

  const hi2 = `
    M 274 ${yr(0.26)}
    C 300 ${yr(0.22)} 332 ${yr(0.24)} 350 ${yr(0.30)}
    C 330 ${yr(0.30)} 312 ${yr(0.34)} 296 ${yr(0.39)}
    C 286 ${yr(0.42)} 268 ${yr(0.37)} 274 ${yr(0.26)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Outline cover shape (mask): hides head outline wherever hair should cover it.
  // We use a dome-ish region down to ~hairline + a bit, plus right puff.
  const outlineCover = `
    M 96 ${yr(0.02)}
    C 168 ${yCrown} 344 ${yCrown} 416 ${yr(0.02)}
    C 452 ${yr(0.14)} 452 ${yr(0.40)} 256 ${clamp(yHairlineC + 18, yr(0.26), yr(0.44))}
    C 60 ${clamp(yHairlineC + 18, yr(0.26), yr(0.44))} 60 ${yr(0.14)} 96 ${yr(0.02)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Extra small “hairline mask” helper (optional future use)
  // Currently not used as a clip; we clip to head for cleanliness.
  // Kept here as a tuning anchor.
  const hairlineGuide = `
    M 160 ${yHairlineL}
    C 206 ${yr(0.30)} 236 ${yr(0.30)} 256 ${yHairlineC}
    C 282 ${yr(0.30)} 316 ${yr(0.30)} 356 ${yHairlineR}
  `.replace(/\s+/g, " ").trim();

  return {
    back,
    front: { frontL, frontM, frontR, tuft },
    seams: { seam1, seam2 },
    his: { hi1, hi2 },
    outlineCover,
    hairlineGuide,
    anchors: { yCrown, yHairlineC, yHairlineL, yHairlineR, yPuffTop, yPuffBot, xPuff },
  };
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hair = sweptRedHair(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>

    <!-- Mask the outline so it doesn't show under hair -->
    <mask id="maskOutlineUnderHair">
      <rect x="0" y="0" width="512" height="512" fill="white" />
      <path d="${hair.outlineCover}" fill="black" />
    </mask>
  </defs>

  <!-- 1) Head fill -->
  <g id="head-fill">
    <path fill="var(--skin)" d="${headD}" />
  </g>

  <!-- 2) Back hair (not clipped) -->
  <g id="hair-back">
    <path fill="var(--hair)" d="${hair.back}" />
    <!-- subtle depth -->
    <path fill="${PALETTE.hair.redShadow}" opacity="0.22" d="${hair.back}" />
  </g>

  <!-- 3) Front hair (clipped to head for a clean hairline) -->
  <g id="hair-front" clip-path="url(#clipHead)">
    <!-- clumps -->
    <path fill="var(--hair)" d="${hair.front.frontL}" />
    <path fill="var(--hair)" d="${hair.front.frontM}" />
    <path fill="var(--hair)" d="${hair.front.frontR}" />
    <path fill="var(--hair)" d="${hair.front.tuft}" />

    <!-- seam valleys -->
    <path fill="${PALETTE.hair.redDeep}" opacity="${HAIR.seamOpacity}" d="${hair.seams.seam1}" />
    <path fill="${PALETTE.hair.redDeep}" opacity="${HAIR.seamOpacity}" d="${hair.seams.seam2}" />

    <!-- seam strokes (extra definition) -->
    <g opacity="${HAIR.seamStrokeOpacity}" stroke="${PALETTE.hair.redDeep}" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M 192 ${hair.anchors.yHairlineC + 44} C 230 ${hair.anchors.yHairlineC + 10} 264 ${hair.anchors.yHairlineC + 4} 308 ${hair.anchors.yHairlineC + 18}" />
      <path d="M 276 ${hair.anchors.yHairlineC + 44} C 312 ${hair.anchors.yHairlineC + 16} 344 ${hair.anchors.yHairlineC + 18} 372 ${hair.anchors.yHairlineC + 38}" />
    </g>

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
