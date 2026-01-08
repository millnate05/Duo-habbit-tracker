// src/engine/avatar/avatar.ts
// v6 — Face features iteration (NO HAIR)
// - Keeps your head morphing exactly (perfect default path at 1/1/1)
// - Removes all hair code
// - Adds: ears, eyes, nose, simple smile (single line)
// - Proportions tuned toward a clean “avatar” look similar to your target reference

export type AvatarRecipe = {
  skinTone: "olive";
  faceLength: number; // 0.5–1.5
  cheekWidth: number; // 0.5–1.5
  jawWidth: number; // 0.5–1.5
  hair: "none"; // kept for compatibility with your editor, but unused
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
  faceLength: 1,
  cheekWidth: 1,
  jawWidth: 1,
  hair: "none",
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: { olive: "#C8A07A" } as const,
  features: {
    white: "#ffffff",
    pupil: "#1a1a1a",
    blush: "rgba(0,0,0,0.06)",
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

// ✅ Your “perfect” default head path
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

  // Cheek influence peak at ~0.55 (slightly lower)
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

/** Keep Y placements stable as faceLength changes */
function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

/**
 * Facial feature geometry tuned for a clean avatar look.
 * All features are rendered inside the head clip (except ears).
 */
function faceFeatures(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);

  // Core y anchors (based on your head template)
  const yEyes = ty(188);
  const yNoseTop = ty(205);
  const yNoseBot = ty(232);
  const yMouth = ty(258);

  // Horizontal anchors
  const cx = 256;
  const eyeSep = 44; // half distance between eye centers
  const eyeRx = 16;
  const eyeRy = 12;
  const pupilR = 5.5;

  // Ears (outside head clip): simple rounded shape
  const earY = ty(208);
  const earW = 22;
  const earH = 34;

  const leftEarCx = 170 - 10; // just outside the left head side
  const rightEarCx = 342 + 10;

  // Nose: small soft triangle-ish linework
  const nose = `
    M ${cx} ${yNoseTop}
    C ${cx - 6} ${ty(214)} ${cx - 6} ${ty(224)} ${cx} ${yNoseBot}
    C ${cx + 6} ${ty(224)} ${cx + 10} ${ty(226)} ${cx + 12} ${ty(230)}
  `.replace(/\s+/g, " ").trim();

  // Smile: single line curve
  const smile = `
    M ${cx - 26} ${yMouth}
    C ${cx - 10} ${ty(272)} ${cx + 10} ${ty(272)} ${cx + 26} ${yMouth}
  `.replace(/\s+/g, " ").trim();

  // Optional subtle cheek shadow (very light, helps “target” vibe)
  const cheekL = { x: cx - 52, y: ty(236) };
  const cheekR = { x: cx + 52, y: ty(236) };

  return {
    // Eyes
    leftEye: { cx: cx - eyeSep, cy: yEyes, rx: eyeRx, ry: eyeRy },
    rightEye: { cx: cx + eyeSep, cy: yEyes, rx: eyeRx, ry: eyeRy },
    leftPupil: { cx: cx - eyeSep + 4, cy: yEyes + 2, r: pupilR },
    rightPupil: { cx: cx + eyeSep + 4, cy: yEyes + 2, r: pupilR },

    // Ears
    leftEar: { cx: leftEarCx, cy: earY, w: earW, h: earH },
    rightEar: { cx: rightEarCx, cy: earY, w: earW, h: earH },

    nose,
    smile,

    cheekL,
    cheekR,
  };
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const f = faceFeatures(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
    .ln { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; fill: none; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>
  </defs>

  <!-- EARS (behind head slightly) -->
  <g id="ears">
    <ellipse cx="${f.leftEar.cx}" cy="${f.leftEar.cy}" rx="${f.leftEar.w}" ry="${f.leftEar.h}" fill="var(--skin)" />
    <ellipse cx="${f.rightEar.cx}" cy="${f.rightEar.cy}" rx="${f.rightEar.w}" ry="${f.rightEar.h}" fill="var(--skin)" />
    <!-- ear inner -->
    <ellipse cx="${f.leftEar.cx + 5}" cy="${f.leftEar.cy + 4}" rx="${f.leftEar.w - 10}" ry="${f.leftEar.h - 12}" fill="rgba(0,0,0,0.05)" />
    <ellipse cx="${f.rightEar.cx - 5}" cy="${f.rightEar.cy + 4}" rx="${f.rightEar.w - 10}" ry="${f.rightEar.h - 12}" fill="rgba(0,0,0,0.05)" />
  </g>

  <!-- HEAD FILL -->
  <g id="head-fill">
    <path fill="var(--skin)" d="${headD}" />
  </g>

  <!-- FACE FEATURES (clipped to head) -->
  <g id="face" clip-path="url(#clipHead)">
    <!-- subtle cheek tone -->
    <ellipse cx="${f.cheekL.x}" cy="${f.cheekL.y}" rx="24" ry="16" fill="${PALETTE.features.blush}" />
    <ellipse cx="${f.cheekR.x}" cy="${f.cheekR.y}" rx="24" ry="16" fill="${PALETTE.features.blush}" />

    <!-- eyes whites -->
    <ellipse cx="${f.leftEye.cx}" cy="${f.leftEye.cy}" rx="${f.leftEye.rx}" ry="${f.leftEye.ry}" fill="${PALETTE.features.white}" />
    <ellipse cx="${f.rightEye.cx}" cy="${f.rightEye.cy}" rx="${f.rightEye.rx}" ry="${f.rightEye.ry}" fill="${PALETTE.features.white}" />

    <!-- pupils -->
    <circle cx="${f.leftPupil.cx}" cy="${f.leftPupil.cy}" r="${f.leftPupil.r}" fill="${PALETTE.features.pupil}" />
    <circle cx="${f.rightPupil.cx}" cy="${f.rightPupil.cy}" r="${f.rightPupil.r}" fill="${PALETTE.features.pupil}" />

    <!-- tiny eye shine -->
    <circle cx="${f.leftPupil.cx - 2.2}" cy="${f.leftPupil.cy - 2.2}" r="1.6" fill="rgba(255,255,255,0.85)" />
    <circle cx="${f.rightPupil.cx - 2.2}" cy="${f.rightPupil.cy - 2.2}" r="1.6" fill="rgba(255,255,255,0.85)" />

    <!-- nose -->
    <path d="${f.nose}" class="ln" />

    <!-- mouth: single smile line -->
    <path d="${f.smile}" class="ln" />
  </g>

  <!-- HEAD OUTLINE LAST -->
  <g id="head-outline">
    <path class="ol" fill="none" d="${headD}" />
    <!-- ear outline accents (optional, subtle) -->
    <path class="ol" fill="none" d="M ${f.leftEar.cx - 10} ${f.leftEar.cy - 6} C ${f.leftEar.cx - 18} ${f.leftEar.cy + 6} ${f.leftEar.cx - 12} ${f.leftEar.cy + 18} ${f.leftEar.cx - 2} ${f.leftEar.cy + 22}" opacity="0.35"/>
    <path class="ol" fill="none" d="M ${f.rightEar.cx + 10} ${f.rightEar.cy - 6} C ${f.rightEar.cx + 18} ${f.rightEar.cy + 6} ${f.rightEar.cx + 12} ${f.rightEar.cy + 18} ${f.rightEar.cx + 2} ${f.rightEar.cy + 22}" opacity="0.35"/>
  </g>
</svg>
`.trim();
}
