// src/engine/avatar/avatar.ts
// v6.4 — Clean build + Eyes/Brows iteration (NO HAIR)
// - Fixes all prior "undefined var / wrong property" type errors
// - Almond eye whites + per-eye clipPaths so iris/pupil never leave the whites
// - Iris sits higher + more inward (toward center) like target
// - Larger pupils
// - Darker brows placed ~6% higher (of face height)
// - Nose remains small "button" style
// - Facial features remain lowered by 15% (your earlier request)

export type AvatarRecipe = {
  skinTone: "olive";
  faceLength: number; // 0.5–1.5
  cheekWidth: number; // 0.5–1.5
  jawWidth: number; // 0.5–1.5
  hair: "none";
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
    eyeWhite: "#ffffff",
    iris: "#2D86B7",
    irisDark: "#1F5F86",
    pupil: "#0D0D0D",
    lid: "rgba(0,0,0,0.18)",
    brow: "#241812",
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

function fmt(n: number) {
  return Number(n.toFixed(2)).toString();
}

/* =========================
   HEAD (unchanged)
========================= */

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

/* =========================
   FACE FEATURES (lowered 15%)
========================= */

function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

function almondEyePath(cx: number, cy: number, w: number, h: number, outerLift: number) {
  // Cleaner almond: stronger top arc, flatter bottom, tapered corners
  const xL = cx - w / 2;
  const xR = cx + w / 2;

  const yT = cy - h / 2;
  const yB = cy + h / 2;

  // subtle tilt: lift outer corner slightly
  const yL = cy + (outerLift < 0 ? outerLift : 0);
  const yR = cy + (outerLift > 0 ? -outerLift : 0);

  const topBulge = h * 0.95;
  const botBulge = h * 0.55;

  return `
    M ${xL} ${yL}
    C ${xL + w * 0.22} ${yT - topBulge * 0.08} ${xR - w * 0.22} ${yT - topBulge * 0.08} ${xR} ${yR}
    C ${xR - w * 0.26} ${yB + botBulge * 0.10} ${xL + w * 0.26} ${yB + botBulge * 0.10} ${xL} ${yL}
    Z
  `.replace(/\s+/g, " ").trim();
}

function lidArcPath(cx: number, cy: number, w: number, outerLift: number) {
  const xL = cx - w / 2;
  const xR = cx + w / 2;

  const yL = cy + (outerLift < 0 ? outerLift * 0.35 : 0);
  const yR = cy + (outerLift > 0 ? -outerLift * 0.35 : 0);

  return `
    M ${xL} ${yL}
    C ${cx - w * 0.18} ${cy - 6} ${cx + w * 0.18} ${cy - 6} ${xR} ${yR}
  `.replace(/\s+/g, " ").trim();
}

function browPath(cx: number, cy: number, side: "L" | "R") {
  // simple strong brow arc
  const tilt = side === "L" ? -1 : 1;
  const w = 54;
  const h = 14;

  const xL = cx - w / 2;
  const xR = cx + w / 2;

  const yL = cy + tilt * 1.5;
  const yR = cy - tilt * 1.5;

  return `
    M ${xL} ${yL}
    C ${cx - w * 0.18} ${cy - h} ${cx + w * 0.18} ${cy - h} ${xR} ${yR}
  `.replace(/\s+/g, " ").trim();
}

function faceFeatures(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);
  const FACE_H = 372 - 84;

  // You asked earlier: lower all facial features by 15%
  const featureShift = FACE_H * 0.15;

  // You asked now: brows ~6% higher
  const browLift = FACE_H * 0.06;

  const shiftY = (y: number) => ty(y + featureShift);

  const cx = 256;

  // Eyes
  const yEyes = shiftY(184);

  const eyeSep = 46;
  const eyeW = 48;
  const eyeH = 18;
  const cornerLift = 2.4;

  // Iris/pupil: higher + inward, pupil bigger
  const irisR = 9.2;
  const pupilR = 5.2;

  const irisUp = -2.4;
  const irisIn = 3.0;

  const leftEyeCx = cx - eyeSep;
  const rightEyeCx = cx + eyeSep;

  const leftIrisCx = leftEyeCx + irisIn;
  const rightIrisCx = rightEyeCx - irisIn;

  const leftIrisCy = yEyes + irisUp;
  const rightIrisCy = yEyes + irisUp;

  // Nose (button-ish)
  const yNose = shiftY(224);
  const nose = `
    M ${cx} ${yNose - 14}
    C ${cx - 4} ${yNose - 6} ${cx - 4} ${yNose + 2} ${cx} ${yNose + 6}
    C ${cx + 6} ${yNose + 10} ${cx + 12} ${yNose + 10} ${cx + 12} ${yNose + 2}
  `.replace(/\s+/g, " ").trim();

  const nostrilL = `
    M ${cx - 6} ${yNose + 6}
    C ${cx - 10} ${yNose + 10} ${cx - 12} ${yNose + 10} ${cx - 14} ${yNose + 6}
  `.replace(/\s+/g, " ").trim();

  const nostrilR = `
    M ${cx + 6} ${yNose + 6}
    C ${cx + 10} ${yNose + 10} ${cx + 12} ${yNose + 10} ${cx + 14} ${yNose + 6}
  `.replace(/\s+/g, " ").trim();

  // Mouth
  const yMouth = shiftY(264);
  const smile = `
    M ${cx - 24} ${yMouth}
    C ${cx - 10} ${yMouth + 10} ${cx + 10} ${yMouth + 10} ${cx + 24} ${yMouth}
  `.replace(/\s+/g, " ").trim();

  // Ears
  const earY = shiftY(210);
  const earW = 22;
  const earH = 34;
  const leftEarCx = 160;
  const rightEarCx = 352;

  // Brows
  const browBaseY = yEyes - 22;
  const browY = browBaseY - browLift;

  return {
    leftEye: { cx: leftEyeCx, cy: yEyes, w: eyeW, h: eyeH, lift: -cornerLift },
    rightEye: { cx: rightEyeCx, cy: yEyes, w: eyeW, h: eyeH, lift: cornerLift },

    leftIris: { cx: leftIrisCx, cy: leftIrisCy, r: irisR },
    rightIris: { cx: rightIrisCx, cy: rightIrisCy, r: irisR },

    leftPupil: { cx: leftIrisCx, cy: leftIrisCy, r: pupilR },
    rightPupil: { cx: rightIrisCx, cy: rightIrisCy, r: pupilR },

    leftLid: { cx: leftEyeCx, cy: yEyes - 5.0, w: eyeW * 0.90, lift: -cornerLift },
    rightLid: { cx: rightEyeCx, cy: yEyes - 5.0, w: eyeW * 0.90, lift: cornerLift },

    leftBrow: { cx: leftEyeCx, cy: browY, side: "L" as const },
    rightBrow: { cx: rightEyeCx, cy: browY, side: "R" as const },

    leftEar: { cx: leftEarCx, cy: earY, w: earW, h: earH },
    rightEar: { cx: rightEarCx, cy: earY, w: earW, h: earH },

    nose,
    nostrilL,
    nostrilR,
    smile,
  };
}

/* =========================
   RENDER
========================= */

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const f = faceFeatures(recipe);

  const leftEyeD = almondEyePath(f.leftEye.cx, f.leftEye.cy, f.leftEye.w, f.leftEye.h, f.leftEye.lift);
  const rightEyeD = almondEyePath(f.rightEye.cx, f.rightEye.cy, f.rightEye.w, f.rightEye.h, f.rightEye.lift);

  const leftLidD = lidArcPath(f.leftLid.cx, f.leftLid.cy, f.leftLid.w, f.leftLid.lift);
  const rightLidD = lidArcPath(f.rightLid.cx, f.rightLid.cy, f.rightLid.w, f.rightLid.lift);

  const leftBrowD = browPath(f.leftBrow.cx, f.leftBrow.cy, "L");
  const rightBrowD = browPath(f.rightBrow.cx, f.rightBrow.cy, "R");

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; fill: none; }
    .ln { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; fill: none; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>

    <!-- Eye clips so iris/pupil never leave the white -->
    <clipPath id="clipEyeL">
      <path d="${leftEyeD}" />
    </clipPath>
    <clipPath id="clipEyeR">
      <path d="${rightEyeD}" />
    </clipPath>
  </defs>

  <!-- Ears (behind head) -->
  <g id="ears">
    <ellipse cx="${f.leftEar.cx}" cy="${f.leftEar.cy}" rx="${f.leftEar.w}" ry="${f.leftEar.h}" fill="var(--skin)" />
    <ellipse cx="${f.rightEar.cx}" cy="${f.rightEar.cy}" rx="${f.rightEar.w}" ry="${f.rightEar.h}" fill="var(--skin)" />
    <ellipse cx="${f.leftEar.cx + 5}" cy="${f.leftEar.cy + 4}" rx="${f.leftEar.w - 10}" ry="${f.leftEar.h - 12}" fill="rgba(0,0,0,0.05)" />
    <ellipse cx="${f.rightEar.cx - 5}" cy="${f.rightEar.cy + 4}" rx="${f.rightEar.w - 10}" ry="${f.rightEar.h - 12}" fill="rgba(0,0,0,0.05)" />
  </g>

  <!-- Head fill -->
  <path d="${headD}" fill="var(--skin)" />

  <!-- Face features -->
  <g id="face" clip-path="url(#clipHead)">

    <!-- Brows -->
    <path d="${leftBrowD}" stroke="${PALETTE.features.brow}" stroke-width="10" stroke-linecap="round" fill="none" />
    <path d="${rightBrowD}" stroke="${PALETTE.features.brow}" stroke-width="10" stroke-linecap="round" fill="none" />

    <!-- Eye whites -->
    <path d="${leftEyeD}" fill="${PALETTE.features.eyeWhite}" />
    <path d="${rightEyeD}" fill="${PALETTE.features.eyeWhite}" />

    <!-- Iris + pupil (clipped to each eye) -->
    <g clip-path="url(#clipEyeL)">
      <circle cx="${f.leftIris.cx}" cy="${f.leftIris.cy}" r="${f.leftIris.r}" fill="${PALETTE.features.iris}" />
      <circle cx="${f.leftIris.cx}" cy="${f.leftIris.cy}" r="${f.leftIris.r - 2.1}" fill="${PALETTE.features.irisDark}" opacity="0.35" />
      <circle cx="${f.leftPupil.cx}" cy="${f.leftPupil.cy}" r="${f.leftPupil.r}" fill="${PALETTE.features.pupil}" />
      <circle cx="${f.leftPupil.cx - 2.0}" cy="${f.leftPupil.cy - 2.0}" r="1.6" fill="rgba(255,255,255,0.85)" />
    </g>

    <g clip-path="url(#clipEyeR)">
      <circle cx="${f.rightIris.cx}" cy="${f.rightIris.cy}" r="${f.rightIris.r}" fill="${PALETTE.features.iris}" />
      <circle cx="${f.rightIris.cx}" cy="${f.rightIris.cy}" r="${f.rightIris.r - 2.1}" fill="${PALETTE.features.irisDark}" opacity="0.35" />
      <circle cx="${f.rightPupil.cx}" cy="${f.rightPupil.cy}" r="${f.rightPupil.r}" fill="${PALETTE.features.pupil}" />
      <circle cx="${f.rightPupil.cx - 2.0}" cy="${f.rightPupil.cy - 2.0}" r="1.6" fill="rgba(255,255,255,0.85)" />
    </g>

    <!-- Subtle upper lids -->
    <path d="${leftLidD}" stroke="${PALETTE.features.lid}" stroke-width="5" stroke-linecap="round" fill="none" />
    <path d="${rightLidD}" stroke="${PALETTE.features.lid}" stroke-width="5" stroke-linecap="round" fill="none" />

    <!-- Nose -->
    <path d="${f.nose}" class="ln" />
    <path d="${f.nostrilL}" stroke="rgba(0,0,0,0.22)" stroke-width="4" stroke-linecap="round" fill="none" />
    <path d="${f.nostrilR}" stroke="rgba(0,0,0,0.22)" stroke-width="4" stroke-linecap="round" fill="none" />

    <!-- Mouth -->
    <path d="${f.smile}" class="ln" />
  </g>

  <!-- Head outline -->
  <path d="${headD}" class="ol" />
</svg>
`.trim();
}
