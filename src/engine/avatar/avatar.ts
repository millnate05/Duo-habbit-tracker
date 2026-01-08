// src/engine/avatar/avatar.ts
// Single-file avatar engine (v4 hair-packs)
// - Keeps your head morphing logic exactly
// - Hair is now a "style pack": hand-authored SVG paths (like real avatar libraries)
// - This is how your TARGET image is almost certainly constructed.

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
    // tuned toward your target
    redBase: "#D44A2A",
    redShadow: "#B5381F",
    redDeep: "#8F2A17",
    redHi: "rgba(255,255,255,0.22)",
    redHi2: "rgba(255,255,255,0.12)",
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

// ✅ Your “perfect” default head path (kept)
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
 * Head morphing (kept)
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

/** Y helper for faceLength adjustments */
function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

/**
 * HAIR STYLE PACKS
 * This is the key shift: hair is hand-authored paths, like the target.
 */
type HairPack = {
  // Where hair is allowed to render (covers skull + side, but not the lower face)
  hairRegionPath: (recipe: AvatarRecipe) => string;

  // Covers the head outline under hair (mask region)
  outlineCoverPath: (recipe: AvatarRecipe) => string;

  // Layers (all are normal SVG d paths)
  base: (recipe: AvatarRecipe) => string;
  bangs: (recipe: AvatarRecipe) => string;
  temple: (recipe: AvatarRecipe) => string;
  tuft: (recipe: AvatarRecipe) => string;

  shadow1: (recipe: AvatarRecipe) => string;
  shadow2: (recipe: AvatarRecipe) => string;

  hi1: (recipe: AvatarRecipe) => string;
  hi2: (recipe: AvatarRecipe) => string;

  // Optional seam stroke (like the darker arc lines in target)
  seamStroke: (recipe: AvatarRecipe) => string;
};

const SweptRedV1: HairPack = {
  /**
   * Hair region: dome + right side, stops around upper forehead.
   * This lets hair extend OUTSIDE the head, but prevents it from going into the face.
   */
  hairRegionPath: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 78 ${ty(70)}
      C 150 ${ty(30)} 362 ${ty(30)} 434 ${ty(70)}
      C 470 ${ty(110)} 470 ${ty(210)} 412 ${ty(240)}
      C 372 ${ty(262)} 316 ${ty(254)} 280 ${ty(238)}
      C 260 ${ty(228)} 238 ${ty(228)} 220 ${ty(238)}
      C 188 ${ty(258)} 136 ${ty(256)} 98 ${ty(232)}
      C 54 ${ty(204)} 44 ${ty(112)} 78 ${ty(70)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  /**
   * Outline cover: hide the skull outline under hair.
   * This is purposely bigger than hairline so you never see harsh head outline.
   */
  outlineCoverPath: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 70 ${ty(60)}
      C 150 ${ty(18)} 362 ${ty(18)} 442 ${ty(60)}
      C 488 ${ty(110)} 480 ${ty(230)} 256 ${ty(236)}
      C 44 ${ty(230)} 24 ${ty(110)} 70 ${ty(60)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  /**
   * BASE MASS (wide, rounded, flattened crown; wraps right side)
   * This is the main silhouette of the target.
   */
  base: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 118 ${ty(154)}
      C 126 ${ty(112)} 166 ${ty(84)} 222 ${ty(74)}
      C 278 ${ty(64)} 344 ${ty(88)} 388 ${ty(126)}
      C 420 ${ty(154)} 430 ${ty(200)} 402 ${ty(226)}
      C 378 ${ty(248)} 344 ${ty(244)} 316 ${ty(232)}
      C 296 ${ty(224)} 272 ${ty(224)} 252 ${ty(238)}
      C 220 ${ty(258)} 170 ${ty(252)} 142 ${ty(226)}
      C 112 ${ty(198)} 104 ${ty(176)} 118 ${ty(154)}
      Z

      M 362 ${ty(134)}
      C 420 ${ty(126)} 446 ${ty(166)} 432 ${ty(212)}
      C 420 ${ty(252)} 350 ${ty(246)} 352 ${ty(204)}
      C 354 ${ty(178)} 356 ${ty(150)} 362 ${ty(134)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  /**
   * BANGS / SWOOP (the dominant forehead wave)
   * This is what makes it look like the target instead of a helmet.
   */
  bangs: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 142 ${ty(166)}
      C 170 ${ty(128)} 232 ${ty(108)} 296 ${ty(118)}
      C 332 ${ty(124)} 356 ${ty(138)} 362 ${ty(156)}
      C 344 ${ty(148)} 330 ${ty(144)} 318 ${ty(150)}
      C 300 ${ty(160)} 290 ${ty(174)} 284 ${ty(186)}
      C 266 ${ty(174)} 246 ${ty(170)} 230 ${ty(182)}
      C 212 ${ty(198)} 190 ${ty(196)} 174 ${ty(188)}
      C 156 ${ty(178)} 140 ${ty(180)} 142 ${ty(166)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  /**
   * TEMPLE CLUMP (wrap around skull on right)
   */
  temple: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 320 ${ty(150)}
      C 346 ${ty(132)} 382 ${ty(150)} 388 ${ty(180)}
      C 392 ${ty(206)} 374 ${ty(234)} 346 ${ty(232)}
      C 330 ${ty(230)} 326 ${ty(214)} 330 ${ty(200)}
      C 336 ${ty(176)} 312 ${ty(170)} 320 ${ty(150)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  /**
   * RIGHT TUFT (small bump on the far right)
   */
  tuft: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 364 ${ty(132)}
      C 410 ${ty(122)} 430 ${ty(152)} 418 ${ty(190)}
      C 406 ${ty(224)} 356 ${ty(220)} 354 ${ty(186)}
      C 352 ${ty(162)} 356 ${ty(144)} 364 ${ty(132)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  /**
   * Shadows: structured valley shapes (under swoop + ridge)
   * These make the chunking read.
   */
  shadow1: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 188 ${ty(168)}
      C 220 ${ty(148)} 264 ${ty(144)} 304 ${ty(154)}
      C 280 ${ty(156)} 260 ${ty(166)} 248 ${ty(182)}
      C 234 ${ty(200)} 206 ${ty(208)} 190 ${ty(198)}
      C 178 ${ty(190)} 178 ${ty(178)} 188 ${ty(168)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  shadow2: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 210 ${ty(126)}
      C 244 ${ty(98)} 294 ${ty(98)} 332 ${ty(124)}
      C 300 ${ty(124)} 268 ${ty(132)} 242 ${ty(150)}
      C 230 ${ty(158)} 202 ${ty(150)} 210 ${ty(126)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  /**
   * Highlights: 2 arcs, aligned with sweep direction
   */
  hi1: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 156 ${ty(150)}
      C 184 ${ty(118)} 232 ${ty(104)} 270 ${ty(112)}
      C 238 ${ty(122)} 210 ${ty(134)} 192 ${ty(154)}
      C 184 ${ty(164)} 150 ${ty(162)} 156 ${ty(150)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  hi2: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 264 ${ty(110)}
      C 292 ${ty(102)} 328 ${ty(110)} 346 ${ty(130)}
      C 322 ${ty(130)} 302 ${ty(140)} 288 ${ty(156)}
      C 280 ${ty(164)} 258 ${ty(146)} 264 ${ty(110)}
      Z
    `.replace(/\s+/g, " ").trim();
  },

  /**
   * Seam stroke: that darker arc line across the wave, like your target.
   */
  seamStroke: (recipe) => {
    const ty = faceTy(recipe);
    return `
      M 136 ${ty(158)}
      C 186 ${ty(122)} 246 ${ty(120)} 300 ${ty(134)}
      C 336 ${ty(142)} 360 ${ty(154)} 376 ${ty(176)}
    `.replace(/\s+/g, " ").trim();
  },
};

const HAIR_PACKS: Record<AvatarRecipe["hair"], HairPack> = {
  sweptRed: SweptRedV1,
};

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hairPack = HAIR_PACKS[recipe.hair];

  // Build style-pack paths
  const hairRegion = hairPack.hairRegionPath(recipe);
  const outlineCover = hairPack.outlineCoverPath(recipe);

  const base = hairPack.base(recipe);
  const bangs = hairPack.bangs(recipe);
  const temple = hairPack.temple(recipe);
  const tuft = hairPack.tuft(recipe);

  const sh1 = hairPack.shadow1(recipe);
  const sh2 = hairPack.shadow2(recipe);

  const hi1 = hairPack.hi1(recipe);
  const hi2 = hairPack.hi2(recipe);

  const seam = hairPack.seamStroke(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  </style>

  <defs>
    <!-- Head shape -->
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>

    <!-- Hair allowed region (prevents hair entering lower face) -->
    <clipPath id="clipHairRegion">
      <path d="${hairRegion}" />
    </clipPath>

    <!-- Mask: hide head outline under hair -->
    <mask id="maskOutlineUnderHair">
      <rect x="0" y="0" width="512" height="512" fill="white" />
      <path d="${outlineCover}" fill="black" />
    </mask>
  </defs>

  <!-- 1) Head fill -->
  <g id="head-fill">
    <path fill="var(--skin)" d="${headD}" />
  </g>

  <!-- 2) Hair (style pack)
         IMPORTANT: clipped to hairRegion, not the head.
         This allows hair to extend outside the head (like the target),
         while still preventing it from dropping into the face. -->
  <g id="hair" clip-path="url(#clipHairRegion)">
    <!-- Base silhouette -->
    <path fill="var(--hair)" d="${base}" />

    <!-- Temple + tuft to create the right-side structure -->
    <path fill="var(--hair)" d="${temple}" />
    <path fill="var(--hair)" d="${tuft}" />

    <!-- Bangs swoop (dominant wave across forehead) -->
    <path fill="var(--hair)" d="${bangs}" />

    <!-- Structured shadows (valleys / overlaps) -->
    <path fill="${PALETTE.hair.redDeep}" opacity="0.18" d="${sh2}" />
    <path fill="${PALETTE.hair.redDeep}" opacity="0.22" d="${sh1}" />

    <!-- Seam arc line (like the darker arc in target) -->
    <path d="${seam}" stroke="${PALETTE.hair.redDeep}" stroke-width="6" opacity="0.16" fill="none" stroke-linecap="round" />

    <!-- Highlights aligned to sweep -->
    <path fill="${PALETTE.hair.redHi}" d="${hi1}" />
    <path fill="${PALETTE.hair.redHi2}" d="${hi2}" />
  </g>

  <!-- 3) Head outline (masked so it vanishes under hair) -->
  <g id="head-outline" mask="url(#maskOutlineUnderHair)">
    <path class="ol" fill="none" d="${headD}" />
  </g>
</svg>
`.trim();
}
