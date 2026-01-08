// src/engine/avatar/avatar.ts
// Single-file avatar engine (v3.3)
// - Preserves the "perfect" default head path exactly at 1/1/1
// - Sliders morph that SAME path (no silhouette change at default)
// - Cheek influence shifted ~10% lower (0.45 -> 0.55)
// - Hair updated to match reference: side-swept red with chunked sections
//   - Back layer for volume (not clipped)
//   - Front chunks (clipped) that create real segmentation
//   - Head outline is clipped so you don't see harsh outline under hair
// - Draw order: head fill -> hair back -> hair front -> outline (face only)

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

  const outlineCutY = ty(172);

  const back = `
    M 132 ${ty(150)}
    C 140 ${ty(108)} 178 ${ty(78)} 232 ${ty(70)}
    C 288 ${ty(62)} 360 ${ty(88)} 398 ${ty(132)}
    C 420 ${ty(158)} 430 ${ty(206)} 404 ${ty(234)}
    C 382 ${ty(258)} 344 ${ty(250)} 316 ${ty(238)}
    C 290 ${ty(226)} 266 ${ty(230)} 242 ${ty(244)}
    C 214 ${ty(260)} 176 ${ty(250)} 152 ${ty(228)}
    C 128 ${ty(206)} 118 ${ty(176)} 132 ${ty(150)}
    Z
  `.replace(/\s+/g, " ").trim();

  const chunkL = `
    M 150 ${ty(162)}
    C 170 ${ty(134)} 210 ${ty(112)} 246 ${ty(118)}
    C 214 ${ty(130)} 190 ${ty(148)} 186 ${ty(170)}
    C 182 ${ty(192)} 156 ${ty(194)} 150 ${ty(178)}
    C 146 ${ty(170)} 146 ${ty(168)} 150 ${ty(162)}
    Z
  `.replace(/\s+/g, " ").trim();

  const chunkM = `
    M 186 ${ty(156)}
    C 220 ${ty(118)} 286 ${ty(98)} 334 ${ty(112)}
    C 300 ${ty(116)} 272 ${ty(132)} 258 ${ty(152)}
    C 246 ${ty(170)} 214 ${ty(188)} 190 ${ty(186)}
    C 176 ${ty(184)} 176 ${ty(168)} 186 ${ty(156)}
    Z
  `.replace(/\s+/g, " ").trim();

  const chunkR = `
    M 270 ${ty(150)}
    C 306 ${ty(118)} 360 ${ty(124)} 382 ${ty(152)}
    C 394 ${ty(168)} 390 ${ty(190)} 370 ${ty(190)}
    C 350 ${ty(190)} 336 ${ty(176)} 326 ${ty(164)}
    C 314 ${ty(178)} 292 ${ty(188)} 270 ${ty(178)}
    C 258 ${ty(172)} 258 ${ty(160)} 270 ${ty(150)}
    Z
  `.replace(/\s+/g, " ").trim();

  const tuft = `
    M 360 ${ty(152)}
    C 404 ${ty(144)} 424 ${ty(170)} 414 ${ty(206)}
    C 404 ${ty(242)} 354 ${ty(238)} 350 ${ty(202)}
    C 348 ${ty(182)} 354 ${ty(166)} 360 ${ty(152)}
    Z
  `.replace(/\s+/g, " ").trim();

  const seam1 = `
    M 210 ${ty(154)}
    C 236 ${ty(134)} 264 ${ty(128)} 290 ${ty(132)}
    C 268 ${ty(140)} 244 ${ty(152)} 226 ${ty(172)}
    C 218 ${ty(180)} 206 ${ty(170)} 210 ${ty(154)}
    Z
  `.replace(/\s+/g, " ").trim();

  // ✅ FIXED: complete + closed seam2 path
  const seam2 = `
    M 300 ${ty(148)}
    C 326 ${ty(140)} 350 ${ty(144)} 360 ${ty(162)}
    C 344 ${ty(160)} 324 ${ty(166)} 314 ${ty(178)}
    C 306 ${ty(186)} 292 ${ty(172)} 300 ${ty(148)}
    Z
  `.replace(/\s+/g, " ").trim();

  const hi1 = `
    M 178 ${ty(160)}
    C 204 ${ty(132)} 236 ${ty(122)} 264 ${ty(126)}
    C 238 ${ty(136)} 214 ${ty(150)} 196 ${ty(168)}
    C 188 ${ty(176)} 172 ${ty(172)} 178 ${ty(160)}
    Z
  `.replace(/\s+/g, " ").trim();

  const hi2 = `
    M 274 ${ty(132)}
    C 302 ${ty(122)} 334 ${ty(126)} 350 ${ty(144)}
    C 328 ${ty(144)} 306 ${ty(152)} 292 ${ty(166)}
    C 282 ${ty(172)} 268 ${ty(160)} 274 ${ty(132)}
    Z
  `.replace(/\s+/g, " ").trim();

  const faceOutlineClipRect = { x: 0, y: outlineCutY, w: 512, h: 512 - outlineCutY };

  return {
    faceOutlineClipRect,
    back,
    chunks: { chunkL, chunkM, chunkR, tuft },
    seams: { seam1, seam2 },
    his: { hi1, hi2 },
  };
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hair = sweptRedHair(recipe);
  const ty = faceTy(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>

    <clipPath id="clipFaceOutline">
      <rect x="${hair.faceOutlineClipRect.x}" y="${hair.faceOutlineClipRect.y}" width="${hair.faceOutlineClipRect.w}" height="${hair.faceOutlineClipRect.h}" />
    </clipPath>
  </defs>

  <g id="head-fill">
    <path fill="var(--skin)" d="${headD}" />
  </g>

  <g id="hair-back">
    <path fill="var(--hair)" d="${hair.back}" />
  </g>

  <g id="hair-front" clip-path="url(#clipHead)">
    <path fill="var(--hair)" d="${hair.chunks.chunkL}" />
    <path fill="var(--hair)" d="${hair.chunks.chunkM}" />
    <path fill="var(--hair)" d="${hair.chunks.chunkR}" />
    <path fill="var(--hair)" d="${hair.chunks.tuft}" />

    <path fill="${PALETTE.hair.redDeep}" opacity="0.22" d="${hair.seams.seam1}" />
    <path fill="${PALETTE.hair.redDeep}" opacity="0.20" d="${hair.seams.seam2}" />

    <g opacity="0.28" stroke="${PALETTE.hair.redDeep}" stroke-width="3" fill="none" stroke-linecap="round">
      <path d="M 186 ${ty(154)} C 230 ${ty(124)} 270 ${ty(118)} 318 ${ty(130)}" />
      <path d="M 262 ${ty(150)} C 300 ${ty(140)} 332 ${ty(144)} 356 ${ty(160)}" />
    </g>

    <path fill="${PALETTE.hair.redHi}" d="${hair.his.hi1}" />
    <path fill="${PALETTE.hair.redHi2}" d="${hair.his.hi2}" />
  </g>

  <g id="head-outline" clip-path="url(#clipFaceOutline)">
    <path class="ol" fill="none" d="${headD}" />
  </g>
</svg>
`.trim();
}
