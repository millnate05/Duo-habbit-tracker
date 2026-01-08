// src/engine/avatar/avatar.ts
// v6.1 — Face features, lowered 15%, no blush

export type AvatarRecipe = {
  skinTone: "olive";
  faceLength: number;
  cheekWidth: number;
  jawWidth: number;
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
    white: "#ffffff",
    pupil: "#1a1a1a",
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
    return cx + (x - cx) * (cheekW * cheekWidth + jawW * jawWidth);
  };

  const ty = (y: number) => cy + (y - cy) * faceLength;

  const tokens = PERFECT_DEFAULT_D.split(/(\s+|,)/).filter(Boolean);
  const out: string[] = [];

  let expect = false;
  let lastX = 0;

  for (const t of tokens) {
    if (/^[A-Za-z]$/.test(t)) {
      expect = /[MC]/.test(t);
      out.push(t);
      continue;
    }

    const n = Number(t);
    if (!Number.isFinite(n)) {
      out.push(t);
      continue;
    }

    if (expect) {
      if (out.at(-1) === "__X__") {
        out[out.length - 1] = tx(lastX, n).toFixed(2);
        out.push(ty(n).toFixed(2));
      } else {
        lastX = n;
        out.push("__X__");
      }
    } else {
      out.push(t);
    }
  }

  return out.join(" ").replace(/\s+/g, " ").trim();
}

/* =========================
   FACE FEATURES (lowered)
========================= */

function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

function faceFeatures(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);

  // 15% vertical shift of face height
  const featureShift = (372 - 84) * 0.15; // ≈ 43px

  const shiftY = (y: number) => ty(y + featureShift);

  const cx = 256;

  // Eyes
  const yEyes = shiftY(188);
  const eyeSep = 44;
  const eyeRx = 16;
  const eyeRy = 12;
  const pupilR = 5.5;

  // Nose
  const yNoseTop = shiftY(205);
  const yNoseBot = shiftY(232);

  // Mouth
  const yMouth = shiftY(258);

  // Ears
  const earY = shiftY(208);
  const earW = 22;
  const earH = 34;

  const leftEarCx = 160;
  const rightEarCx = 352;

  return {
    leftEye: { cx: cx - eyeSep, cy: yEyes, rx: eyeRx, ry: eyeRy },
    rightEye: { cx: cx + eyeSep, cy: yEyes, rx: eyeRx, ry: eyeRy },
    leftPupil: { cx: cx - eyeSep + 4, cy: yEyes + 2, r: pupilR },
    rightPupil: { cx: cx + eyeSep + 4, cy: yEyes + 2, r: pupilR },

    leftEar: { cx: leftEarCx, cy: earY, w: earW, h: earH },
    rightEar: { cx: rightEarCx, cy: earY, w: earW, h: earH },

    nose: `
      M ${cx} ${yNoseTop}
      C ${cx - 6} ${shiftY(214)} ${cx - 6} ${shiftY(224)} ${cx} ${yNoseBot}
      C ${cx + 6} ${shiftY(224)} ${cx + 10} ${shiftY(226)} ${cx + 12} ${shiftY(230)}
    `.trim(),

    smile: `
      M ${cx - 26} ${yMouth}
      C ${cx - 10} ${shiftY(272)} ${cx + 10} ${shiftY(272)} ${cx + 26} ${yMouth}
    `.trim(),
  };
}

/* =========================
   RENDER
========================= */

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const f = faceFeatures(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; fill: none; stroke-linecap: round; stroke-linejoin: round; }
    .ln { stroke: var(--outline); stroke-width: 4; fill: none; stroke-linecap: round; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>
  </defs>

  <!-- Ears -->
  <ellipse cx="${f.leftEar.cx}" cy="${f.leftEar.cy}" rx="${f.leftEar.w}" ry="${f.leftEar.h}" fill="var(--skin)" />
  <ellipse cx="${f.rightEar.cx}" cy="${f.rightEar.cy}" rx="${f.rightEar.w}" ry="${f.rightEar.h}" fill="var(--skin)" />

  <!-- Head -->
  <path d="${headD}" fill="var(--skin)" />

  <!-- Face -->
  <g clip-path="url(#clipHead)">
    <ellipse cx="${f.leftEye.cx}" cy="${f.leftEye.cy}" rx="${f.leftEye.rx}" ry="${f.leftEye.ry}" fill="${PALETTE.features.white}" />
    <ellipse cx="${f.rightEye.cx}" cy="${f.rightEye.cy}" rx="${f.rightEye.rx}" ry="${f.rightEye.ry}" fill="${PALETTE.features.white}" />

    <circle cx="${f.leftPupil.cx}" cy="${f.leftPupil.cy}" r="${f.leftPupil.r}" fill="${PALETTE.features.pupil}" />
    <circle cx="${f.rightPupil.cx}" cy="${f.rightPupil.cy}" r="${f.rightPupil.r}" fill="${PALETTE.features.pupil}" />

    <path d="${f.nose}" class="ln" />
    <path d="${f.smile}" class="ln" />
  </g>

  <!-- Outline -->
  <path d="${headD}" class="ol" />
</svg>
`.trim();
}
