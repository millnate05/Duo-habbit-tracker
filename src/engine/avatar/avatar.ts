// src/engine/avatar/avatar.ts
// v6.2 — Face features iteration (NO HAIR)
// Changes in this iteration:
// - Eyes updated to a soft almond / rounded-almond: wider, shorter, calmer (less “surprised”)
// - Iris + pupil proportions updated closer to target vibe
// - Added a subtle upper-lid suggestion (no harsh outline)
// - Nose updated to a small, soft “button” nose: short bridge + tiny nostril/wing cues
// - All features remain lowered by 15% (as previously requested)
// - No blush

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
    eyeWhite: "#ffffff",
    iris: "#2D86B7", // target-like blue (tweak later)
    irisDark: "#1F5F86",
    pupil: "#111111",
    lid: "rgba(0,0,0,0.18)", // subtle upper lid suggestion
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
   FACE FEATURES (lowered 15%)
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
  const featureShift = (372 - 84) * 0.15; // ~43px on the base head
  const shiftY = (y: number) => ty(y + featureShift);

  const cx = 256;

  // -------------------------
  // EYES — target-like: soft almond
  // Wider + shorter, slightly upturned outer corner
  // -------------------------
  const yEyes = shiftY(184);

  const eyeSep = 46; // slightly wider set than before
  const eyeW = 44;   // width of the almond
  const eyeH = 20;   // height of the almond (shorter => calmer)
  const cornerLift = 2.2; // subtle upward tilt at outer corner

  // Iris/pupil: larger iris vs white, pupil centered
  const irisR = 9.3;
  const pupilR = 4.2;

  // -------------------------
  // NOSE — target-like: small “button” nose
  // Short bridge, tiny nostril hints, no long hook
  // -------------------------
  const yNose = shiftY(224);
  const nose = `
    M ${cx} ${yNose - 14}
    C ${cx - 4} ${yNose - 6} ${cx - 4} ${yNose + 2} ${cx} ${yNose + 6}
    C ${cx + 6} ${yNose + 10} ${cx + 12} ${yNose + 10} ${cx + 12} ${yNose + 2}
  `.replace(/\s+/g, " ").trim();

  // Tiny nostril/wing cues (very subtle, short strokes)
  const nostrilL = `
    M ${cx - 6} ${yNose + 6}
    C ${cx - 10} ${yNose + 10} ${cx - 12} ${yNose + 10} ${cx - 14} ${yNose + 6}
  `.replace(/\s+/g, " ").trim();

  const nostrilR = `
    M ${cx + 6} ${yNose + 6}
    C ${cx + 10} ${yNose + 10} ${cx + 12} ${yNose + 10} ${cx + 14} ${yNose + 6}
  `.replace(/\s+/g, " ").trim();

  // -------------------------
  // MOUTH — keep simple smile line
  // -------------------------
  const yMouth = shiftY(264);
  const smile = `
    M ${cx - 24} ${yMouth}
    C ${cx - 10} ${yMouth + 10} ${cx + 10} ${yMouth + 10} ${cx + 24} ${yMouth}
  `.replace(/\s+/g, " ").trim();

  // -------------------------
  // EARS — keep simple, symmetric, lowered with features
  // -------------------------
  const earY = shiftY(210);
  const earW = 22;
  const earH = 34;
  const leftEarCx = 160;
  const rightEarCx = 352;

  return {
    // Eyes: store centers + dims, we will draw as path (almond) instead of ellipse
    leftEye: { cx: cx - eyeSep, cy: yEyes, w: eyeW, h: eyeH, lift: -cornerLift },
    rightEye: { cx: cx + eyeSep, cy: yEyes, w: eyeW, h: eyeH, lift: cornerLift },

    leftIris: { cx: cx - eyeSep + 2.2, cy: yEyes + 1.2, r: irisR },
    rightIris: { cx: cx + eyeSep + 2.2, cy: yEyes + 1.2, r: irisR },

    leftPupil: { cx: cx - eyeSep + 2.2, cy: yEyes + 1.2, r: pupilR },
    rightPupil: { cx: cx + eyeSep + 2.2, cy: yEyes + 1.2, r: pupilR },

    // Upper lid suggestion: short arc
    leftLid: { cx: cx - eyeSep, cy: yEyes - 5.2, w: eyeW * 0.86, lift: -cornerLift },
    rightLid: { cx: cx + eyeSep, cy: yEyes - 5.2, w: eyeW * 0.86, lift: cornerLift },

    // Ears
    leftEar: { cx: leftEarCx, cy: earY, w: earW, h: earH },
    rightEar: { cx: rightEarCx, cy: earY, w: earW, h: earH },

    // Nose + nostrils
    nose,
    nostrilL,
    nostrilR,

    // Mouth
    smile,
  };
}

function almondEyePath(cx: number, cy: number, w: number, h: number, outerLift: number) {
  // Almond: two curves meeting at corners
  const xL = cx - w / 2;
  const xR = cx + w / 2;
  const yT = cy - h / 2;
  const yB = cy + h / 2;

  // Outer corner slight lift (positive = raise outer corner, negative = raise inner corner)
  const yL = cy + (outerLift < 0 ? outerLift : 0);
  const yR = cy + (outerLift > 0 ? -outerLift : 0);

  // Control points for smoothness
  const cTop = h * 0.85;
  const cBot = h * 0.65;

  return `
    M ${xL} ${yL}
    C ${xL + w * 0.28} ${yT - cTop * 0.1} ${xR - w * 0.28} ${yT - cTop * 0.1} ${xR} ${yR}
    C ${xR - w * 0.28} ${yB + cBot * 0.1} ${xL + w * 0.28} ${yB + cBot * 0.1} ${xL} ${yL}
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
    <!-- Eye whites (almond paths) -->
    <path d="${leftEyeD}" fill="${PALETTE.features.eyeWhite}" />
    <path d="${rightEyeD}" fill="${PALETTE.features.eyeWhite}" />

    <!-- Iris -->
    <circle cx="${f.leftIris.cx}" cy="${f.leftIris.cy}" r="${f.leftIris.r}" fill="${PALETTE.features.iris}" />
    <circle cx="${f.rightIris.cx}" cy="${f.rightIris.cy}" r="${f.rightIris.r}" fill="${PALETTE.features.iris}" />
    <!-- Iris inner dark ring -->
    <circle cx="${f.leftIris.cx}" cy="${f.leftIris.cy}" r="${f.leftIris.r - 2.2}" fill="${PALETTE.features.irisDark}" opacity="0.35" />
    <circle cx="${f.rightIris.cx}" cy="${f.rightIris.cy}" r="${f.rightIris.r - 2.2}" fill="${PALETTE.features.irisDark}" opacity="0.35" />

    <!-- Pupil -->
    <circle cx="${f.leftPupil.cx}" cy="${f.leftPupil.cy}" r="${f.leftPupil.r}" fill="${PALETTE.features.pupil}" />
    <circle cx="${f.rightPupil.cx}" cy="${f.rightPupil.cy}" r="${f.rightPupil.r}" fill="${PALETTE.features.pupil}" />

    <!-- Eye shine -->
    <circle cx="${f.leftPupil.cx - 2.1}" cy="${f.leftPupil.cy - 2.1}" r="1.6" fill="rgba(255,255,255,0.85)" />
    <circle cx="${f.rightPupil.cx - 2.1}" cy="${f.rightPupil.cy - 2.1}" r="1.6" fill="rgba(255,255,255,0.85)" />

    <!-- Subtle upper lid -->
    <path d="${leftLidD}" stroke="${PALETTE.features.lid}" stroke-width="5" stroke-linecap="round" fill="none" />
    <path d="${rightLidD}" stroke="${PALETTE.features.lid}" stroke-width="5" stroke-linecap="round" fill="none" />

    <!-- Nose (small button nose) -->
    <path d="${f.nose}" class="ln" />
    <path d="${f.nostrilL}" stroke="rgba(0,0,0,0.22)" stroke-width="4" stroke-linecap="round" fill="none" />
    <path d="${f.nostrilR}" stroke="rgba(0,0,0,0.22)" stroke-width="4" stroke-linecap="round" fill="none" />

    <!-- Mouth (simple smile line) -->
    <path d="${f.smile}" class="ln" />
  </g>

  <!-- Head outline -->
  <path d="${headD}" class="ol" />
</svg>
`.trim();
}
