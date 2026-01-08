// src/engine/avatar/avatar.ts
// Single-file avatar engine (v3.7)
// Goal: match the TARGET red hairstyle silhouette + structure (NOT just “a blob”)
// What this version adds vs prior:
// - Wide, skull-wrapping silhouette (not tall/pointy)
// - Clearly side-swept flow (left -> right) with a readable “wave ridge”
// - 4 main clumps (left flicks, main swoop, mid clump, right temple clump) + separate right tuft
// - Temple/side coverage so hair wraps around the head (no abrupt cutoff)
// - 3-tone shading system: base + structured shadows (overlaps/under-swoop) + aligned highlights
// - Outline masked out under hair using a hair-cover mask (not a rectangle)

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
    // Target-ish warm red + structured shadows/highlights
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
 * Target-style hair:
 * - wide + skull-wrapping
 * - side-swept (left->right) with a visible wave ridge
 * - multiple clumps with overlap + structured shading
 */
function targetSweptRedHair(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);

  // Head bounds (for ratio-y anchors)
  const yTop = 84;
  const yBottom = 372;
  const H = yBottom - yTop; // 288
  const yr = (r: number) => ty(yTop + H * r);

  // Key Y levels (tuned to avoid tall/pointy blob)
  const yCrown = ty(yTop - H * 0.08); // slightly above head top, not spiky
  const yCapTop = yr(0.05); // near top of skull
  const yCapMid = yr(0.14);
  const yHairlineL = yr(0.22);
  const yHairlineC = yr(0.25);
  const yHairlineR = yr(0.21);

  // Temple / side coverage depth
  const yTemple = yr(0.36);
  const ySideEnd = yr(0.48);

  // Width: intentionally wider than your current, closer to the target
  const xL = 150;
  const xR = 362;
  const xPuff = 398; // right-side lobe (not too huge)

  // -----------------------------
  // BACK MASS (NOT clipped)
  // Wraps skull + supports right lobe. Rounded / slightly flattened top.
  // -----------------------------
  const back = `
    M ${xL} ${yr(0.22)}
    C ${xL + 6} ${yr(0.12)} 198 ${yCrown} 252 ${yCrown}
    C 312 ${yCrown} 360 ${yr(0.10)} ${xR + 10} ${yr(0.18)}
    C ${xPuff + 8} ${yr(0.22)} ${xPuff + 10} ${yr(0.36)} ${xPuff - 8} ${yr(0.44)}
    C ${xR + 4} ${yr(0.54)} 322 ${yr(0.52)} 296 ${yr(0.48)}
    C 272 ${yr(0.44)} 250 ${yr(0.46)} 230 ${yr(0.52)}
    C 208 ${yr(0.58)} 176 ${yr(0.56)} ${xL - 6} ${yr(0.44)}
    C ${xL - 14} ${yr(0.34)} ${xL - 6} ${yr(0.28)} ${xL} ${yr(0.22)}
    Z
  `.replace(/\s+/g, " ").trim();

  // -----------------------------
  // FRONT CLUMPS (CLIPPED)
  // Build the sweep direction: left flicks -> main swoop -> mid clump -> right temple clump.
  // These overlaps are what stop the “blob” read.
  // -----------------------------

  // Left flick 1 (short)
  const flick1 = `
    M 166 ${yHairlineL}
    C 138 ${yHairlineL - 10} 142 ${yTemple - 6} 170 ${yTemple - 10}
    C 176 ${yTemple - 12} 176 ${yHairlineL + 6} 166 ${yHairlineL}
    Z
  `.replace(/\s+/g, " ").trim();

  // Left flick 2 (medium)
  const flick2 = `
    M 178 ${yHairlineC - 4}
    C 148 ${yHairlineC - 14} 152 ${yTemple + 4} 186 ${yTemple - 2}
    C 196 ${yTemple - 4} 196 ${yHairlineC + 8} 178 ${yHairlineC - 4}
    Z
  `.replace(/\s+/g, " ").trim();

  // Left flick 3 (longer)
  const flick3 = `
    M 194 ${yHairlineC + 4}
    C 158 ${yHairlineC - 2} 160 ${ySideEnd + 8} 206 ${yTemple + 16}
    C 220 ${yTemple + 10} 216 ${yHairlineC + 18} 194 ${yHairlineC + 4}
    Z
  `.replace(/\s+/g, " ").trim();

  // Main swoop (dominant wave across forehead)
  const swoop = `
    M 188 ${yr(0.16)}
    C 220 ${yCapTop} 292 ${yCapTop + 6} 332 ${yCapMid}
    C 302 ${yCapMid - 4} 276 ${yr(0.22)} 262 ${yr(0.28)}
    C 246 ${yr(0.36)} 214 ${yr(0.42)} 192 ${yr(0.40)}
    C 178 ${yr(0.38)} 176 ${yr(0.26)} 188 ${yr(0.16)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Mid clump (sits under the swoop, adds thickness and overlap)
  const midClump = `
    M 238 ${yr(0.26)}
    C 262 ${yr(0.22)} 304 ${yr(0.22)} 324 ${yr(0.30)}
    C 304 ${yr(0.30)} 288 ${yr(0.34)} 278 ${yr(0.40)}
    C 268 ${yr(0.46)} 234 ${yr(0.46)} 224 ${yr(0.40)}
    C 216 ${yr(0.34)} 220 ${yr(0.28)} 238 ${yr(0.26)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Right temple clump (wraps around the temple/side of head)
  const temple = `
    M 314 ${yHairlineR + 8}
    C 336 ${yHairlineR - 6} 368 ${yHairlineR + 10} 378 ${yTemple - 6}
    C 386 ${yTemple + 10} 378 ${ySideEnd} 350 ${ySideEnd - 4}
    C 334 ${ySideEnd - 6} 326 ${ySideEnd - 20} 324 ${yTemple + 2}
    C 322 ${yTemple - 10} 306 ${yHairlineR + 18} 314 ${yHairlineR + 8}
    Z
  `.replace(/\s+/g, " ").trim();

  // Right tuft (small bump on the far right like the target)
  const tuft = `
    M 360 ${yr(0.18)}
    C ${xPuff} ${yr(0.16)} ${xPuff + 12} ${yr(0.22)} ${xPuff - 2} ${yr(0.28)}
    C ${xPuff - 16} ${yr(0.34)} 360 ${yr(0.34)} 350 ${yr(0.30)}
    C 344 ${yr(0.26)} 350 ${yr(0.20)} 360 ${yr(0.18)}
    Z
  `.replace(/\s+/g, " ").trim();

  // -----------------------------
  // SHADOWS: structured (overlaps / under swoop / near part)
  // These are what make it read like the target rather than “flat”.
  // -----------------------------

  // Shadow under the main swoop (casts over mid clump)
  const shadowUnderSwoop = `
    M 220 ${yr(0.30)}
    C 252 ${yr(0.26)} 298 ${yr(0.28)} 322 ${yr(0.34)}
    C 300 ${yr(0.34)} 276 ${yr(0.38)} 262 ${yr(0.44)}
    C 250 ${yr(0.50)} 220 ${yr(0.48)} 214 ${yr(0.42)}
    C 210 ${yr(0.38)} 208 ${yr(0.34)} 220 ${yr(0.30)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Part / ridge shadow near the crown (subtle arc)
  const shadowRidge = `
    M 196 ${yr(0.18)}
    C 234 ${yr(0.10)} 286 ${yr(0.10)} 332 ${yr(0.18)}
    C 300 ${yr(0.16)} 252 ${yr(0.18)} 220 ${yr(0.24)}
    C 208 ${yr(0.26)} 188 ${yr(0.24)} 196 ${yr(0.18)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Right temple depth shadow
  const shadowTemple = `
    M 328 ${yr(0.28)}
    C 346 ${yr(0.26)} 366 ${yr(0.32)} 370 ${yr(0.38)}
    C 372 ${yr(0.44)} 360 ${yr(0.50)} 346 ${yr(0.50)}
    C 338 ${yr(0.50)} 338 ${yr(0.44)} 340 ${yr(0.40)}
    C 342 ${yr(0.34)} 320 ${yr(0.34)} 328 ${yr(0.28)}
    Z
  `.replace(/\s+/g, " ").trim();

  // -----------------------------
  // HIGHLIGHTS: aligned with sweep direction (few, strong)
  // -----------------------------
  const hi1 = `
    M 190 ${yr(0.22)}
    C 220 ${yr(0.14)} 264 ${yr(0.12)} 300 ${yr(0.16)}
    C 270 ${yr(0.20)} 240 ${yr(0.22)} 218 ${yr(0.30)}
    C 206 ${yr(0.34)} 182 ${yr(0.32)} 190 ${yr(0.22)}
    Z
  `.replace(/\s+/g, " ").trim();

  const hi2 = `
    M 270 ${yr(0.18)}
    C 296 ${yr(0.14)} 330 ${yr(0.16)} 346 ${yr(0.22)}
    C 324 ${yr(0.22)} 304 ${yr(0.26)} 292 ${yr(0.32)}
    C 284 ${yr(0.36)} 262 ${yr(0.32)} 270 ${yr(0.18)}
    Z
  `.replace(/\s+/g, " ").trim();

  // -----------------------------
  // OUTLINE COVER MASK: hides head outline where hair sits
  // Build a cover dome down to around mid-forehead/temple level.
  // -----------------------------
  const outlineCover = `
    M 96 ${yr(0.00)}
    C 168 ${yCrown} 344 ${yCrown} 416 ${yr(0.00)}
    C 458 ${yr(0.12)} 456 ${yr(0.42)} 256 ${yr(0.44)}
    C 56 ${yr(0.44)} 54 ${yr(0.12)} 96 ${yr(0.00)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Hairline wave (for subtle definition line like the target)
  const hairlineWave = `
    M 160 ${yHairlineL}
    C 210 ${yHairlineL + 18} 240 ${yHairlineC + 10} 256 ${yHairlineC}
    C 286 ${yHairlineC - 14} 320 ${yHairlineR - 4} 362 ${yHairlineR + 14}
  `.replace(/\s+/g, " ").trim();

  return {
    back,
    front: { flick1, flick2, flick3, swoop, midClump, temple, tuft },
    shadows: { shadowUnderSwoop, shadowRidge, shadowTemple },
    highlights: { hi1, hi2 },
    outlineCover,
    hairlineWave,
  };
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hair = targetSweptRedHair(recipe);

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

  <!-- 2) Hair back layer (NOT clipped) - supports skull wrap + right lobe -->
  <g id="hair-back">
    <path fill="var(--hair)" d="${hair.back}" />
    <!-- gentle depth so it doesn't read flat -->
    <path fill="${PALETTE.hair.redShadow}" opacity="0.18" d="${hair.back}" />
  </g>

  <!-- 3) Hair front (CLIPPED) - clumps + structured shading + aligned highlights -->
  <g id="hair-front" clip-path="url(#clipHead)">
    <!-- clumps (order matters: back-to-front overlap) -->
    <path fill="var(--hair)" d="${hair.front.midClump}" />
    <path fill="var(--hair)" d="${hair.front.temple}" />
    <path fill="var(--hair)" d="${hair.front.swoop}" />

    <!-- left flicks sit on top so they read as individual bits -->
    <path fill="var(--hair)" d="${hair.front.flick3}" />
    <path fill="var(--hair)" d="${hair.front.flick2}" />
    <path fill="var(--hair)" d="${hair.front.flick1}" />

    <!-- right tuft -->
    <path fill="var(--hair)" d="${hair.front.tuft}" />

    <!-- shadows (placed where overlap would happen in the target) -->
    <path fill="${PALETTE.hair.redDeep}" opacity="0.18" d="${hair.shadows.shadowRidge}" />
    <path fill="${PALETTE.hair.redDeep}" opacity="0.22" d="${hair.shadows.shadowUnderSwoop}" />
    <path fill="${PALETTE.hair.redDeep}" opacity="0.18" d="${hair.shadows.shadowTemple}" />

    <!-- subtle hairline wave definition (like the target’s darker arc) -->
    <path d="${hair.hairlineWave}" stroke="${PALETTE.hair.redDeep}" stroke-width="5" opacity="0.14" fill="none" stroke-linecap="round" />

    <!-- highlights aligned with sweep direction -->
    <path fill="${PALETTE.hair.redHi}" d="${hair.highlights.hi1}" />
    <path fill="${PALETTE.hair.redHi2}" d="${hair.highlights.hi2}" />
  </g>

  <!-- 4) Head outline (masked so it vanishes under hair) -->
  <g id="head-outline" mask="url(#maskOutlineUnderHair)">
    <path class="ol" fill="none" d="${headD}" />
  </g>
</svg>
`.trim();
}
