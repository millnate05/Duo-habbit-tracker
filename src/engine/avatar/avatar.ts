// src/engine/avatar/avatar.ts
// Single-file avatar engine (v3.4)
// - Preserves the "perfect" default head path exactly at 1/1/1
// - Sliders morph that SAME path (no silhouette change at default)
// - Cheek influence shifted ~10% lower (0.45 -> 0.55)
// - Hair: side-swept red with real definition
//   - Back silhouette redesigned (less helmet, more flow)
//   - Front hair uses a MASK to "cut" separation grooves (true chunking)
//   - Outline is masked out wherever hair covers the head (no harsh head outline under hair)
// - Draw order: head fill -> hair back -> hair front -> outline (masked)

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

function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

function sweptRedHair(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);

  // A "cover" region: anything above this is hair-covered, so outline should disappear there.
  const coverTopY = ty(205);

  // BACK hair silhouette: add peaks/valleys so it stops reading as a helmet.
  // Less round on right, more "lift" at top, small indentation near left.
  const back = `
    M 138 ${ty(168)}
    C 134 ${ty(132)} 152 ${ty(96)} 198 ${ty(78)}
    C 232 ${ty(64)} 278 ${ty(62)} 314 ${ty(72)}
    C 358 ${ty(84)} 392 ${ty(112)} 410 ${ty(142)}
    C 426 ${ty(170)} 424 ${ty(214)} 398 ${ty(236)}
    C 374 ${ty(256)} 344 ${ty(252)} 316 ${ty(238)}
    C 290 ${ty(224)} 262 ${ty(224)} 238 ${ty(242)}
    C 214 ${ty(262)} 180 ${ty(256)} 158 ${ty(236)}
    C 136 ${ty(216)} 126 ${ty(194)} 138 ${ty(168)}
    Z
  `.replace(/\s+/g, " ").trim();

  // FRONT base mass (this will be cut by a mask into chunks)
  // More hair "flow": deeper S-curve and a more natural hairline dip.
  const frontBase = `
    M 148 ${ty(176)}
    C 170 ${ty(132)} 240 ${ty(104)} 308 ${ty(114)}
    C 362 ${ty(122)} 402 ${ty(154)} 396 ${ty(190)}
    C 392 ${ty(214)} 372 ${ty(232)} 344 ${ty(224)}
    C 328 ${ty(220)} 318 ${ty(206)} 312 ${ty(192)}
    C 296 ${ty(212)} 276 ${ty(224)} 252 ${ty(214)}
    C 228 ${ty(202)} 202 ${ty(206)} 184 ${ty(220)}
    C 162 ${ty(236)} 142 ${ty(218)} 146 ${ty(196)}
    C 148 ${ty(188)} 148 ${ty(182)} 148 ${ty(176)}
    Z

    M 360 ${ty(156)}
    C 404 ${ty(146)} 426 ${ty(176)} 414 ${ty(212)}
    C 402 ${ty(248)} 348 ${ty(244)} 350 ${ty(206)}
    C 352 ${ty(184)} 356 ${ty(168)} 360 ${ty(156)}
    Z
  `.replace(/\s+/g, " ").trim();

  // CUT GROOVES (black in mask) — these are literal "cuts" in the hair shape.
  // Think of them as thin wedges/valleys between clumps.
  const cut1 = `
    M 210 ${ty(206)}
    C 228 ${ty(176)} 252 ${ty(160)} 280 ${ty(160)}
    C 258 ${ty(178)} 240 ${ty(198)} 230 ${ty(224)}
    C 224 ${ty(240)} 206 ${ty(232)} 210 ${ty(206)}
    Z
  `.replace(/\s+/g, " ").trim();

  const cut2 = `
    M 288 ${ty(200)}
    C 306 ${ty(176)} 334 ${ty(170)} 356 ${ty(184)}
    C 334 ${ty(186)} 316 ${ty(200)} 306 ${ty(220)}
    C 298 ${ty(236)} 280 ${ty(226)} 288 ${ty(200)}
    Z
  `.replace(/\s+/g, " ").trim();

  // A smaller cut near the right tuft so it separates from the main swoop
  const cut3 = `
    M 346 ${ty(188)}
    C 368 ${ty(176)} 386 ${ty(186)} 394 ${ty(204)}
    C 382 ${ty(204)} 366 ${ty(210)} 358 ${ty(222)}
    C 350 ${ty(234)} 338 ${ty(214)} 346 ${ty(188)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Seam shadows (painted on top to deepen the valleys, even where the mask cut is small)
  const seamShade1 = `
    M 206 ${ty(206)}
    C 230 ${ty(174)} 260 ${ty(160)} 294 ${ty(166)}
    C 270 ${ty(176)} 244 ${ty(196)} 232 ${ty(226)}
    C 226 ${ty(240)} 202 ${ty(232)} 206 ${ty(206)}
    Z
  `.replace(/\s+/g, " ").trim();

  const seamShade2 = `
    M 284 ${ty(198)}
    C 310 ${ty(176)} 340 ${ty(176)} 364 ${ty(190)}
    C 340 ${ty(190)} 318 ${ty(204)} 308 ${ty(224)}
    C 300 ${ty(238)} 278 ${ty(228)} 284 ${ty(198)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Highlights shaped like the reference (chunky glossy arcs)
  const hi1 = `
    M 180 ${ty(184)}
    C 206 ${ty(150)} 244 ${ty(134)} 278 ${ty(140)}
    C 250 ${ty(154)} 224 ${ty(170)} 206 ${ty(192)}
    C 198 ${ty(202)} 172 ${ty(198)} 180 ${ty(184)}
    Z
  `.replace(/\s+/g, " ").trim();

  const hi2 = `
    M 280 ${ty(144)}
    C 310 ${ty(132)} 344 ${ty(138)} 362 ${ty(160)}
    C 338 ${ty(160)} 314 ${ty(170)} 296 ${ty(186)}
    C 286 ${ty(194)} 270 ${ty(178)} 280 ${ty(144)}
    Z
  `.replace(/\s+/g, " ").trim();

  // Outline mask cover (covers top + sides where hair overlaps)
  const outlineCover = `
    M 100 ${ty(86)}
    C 170 ${ty(44)} 342 ${ty(44)} 412 ${ty(86)}
    C 450 ${ty(126)} 448 ${coverTopY} 256 ${coverTopY}
    C 64 ${coverTopY} 62 ${ty(126)} 100 ${ty(86)}
    Z
  `.replace(/\s+/g, " ").trim();

  return {
    back,
    frontBase,
    cuts: { cut1, cut2, cut3 },
    seamShades: { seamShade1, seamShade2 },
    his: { hi1, hi2 },
    outlineCover,
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

    <!-- Mask to "cut" grooves out of the front hair (true separation) -->
    <mask id="maskHairCuts">
      <!-- start: hair visible -->
      <rect x="0" y="0" width="512" height="512" fill="white" />
      <!-- cuts: remove thin wedges (black) -->
      <path d="${hair.cuts.cut1}" fill="black" />
      <path d="${hair.cuts.cut2}" fill="black" />
      <path d="${hair.cuts.cut3}" fill="black" />
    </mask>

    <!-- Mask the outline so it doesn't show where hair covers the head -->
    <mask id="maskOutlineUnderHair">
      <!-- outline visible by default -->
      <rect x="0" y="0" width="512" height="512" fill="white" />
      <!-- hair cover region hides outline (black) -->
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
    <!-- subtle back shadow for depth -->
    <path fill="${PALETTE.hair.redShadow}" opacity="0.35" d="${hair.back}" />
  </g>

  <!-- 3) Front hair (clipped to head, then cut by mask into chunks) -->
  <g id="hair-front" clip-path="url(#clipHead)">
    <!-- base mass -->
    <path fill="var(--hair)" d="${hair.frontBase}" mask="url(#maskHairCuts)" />

    <!-- deepen valleys so the cuts read as separations -->
    <path fill="${PALETTE.hair.redDeep}" opacity="0.22" d="${hair.seamShades.seamShade1}" />
    <path fill="${PALETTE.hair.redDeep}" opacity="0.20" d="${hair.seamShades.seamShade2}" />

    <!-- optional thin seam lines (helps the “chunk” look a LOT) -->
    <g opacity="0.22" stroke="${PALETTE.hair.redDeep}" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M 196 ${faceTy(recipe)(206)} C 232 ${faceTy(recipe)(172)} 262 ${faceTy(recipe)(160)} 304 ${faceTy(recipe)(172)}" />
      <path d="M 276 ${faceTy(recipe)(204)} C 312 ${faceTy(recipe)(178)} 344 ${faceTy(recipe)(180)} 372 ${faceTy(recipe)(198)}" />
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
