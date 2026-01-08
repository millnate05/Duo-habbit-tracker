// src/engine/avatar/avatar.ts
// Single-file avatar engine (v3): preserve default head path,
// sliders morph that path, cheek influence shifted lower,
// add crew cut hair clipped to head so it hugs perfectly.

export type AvatarRecipe = {
  skinTone: "olive";
  faceLength: number; // 0.5–1.5
  cheekWidth: number; // 0.5–1.5
  jawWidth: number; // 0.5–1.5
  hair: "crewcut"; // single style for now
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
  faceLength: 1,
  cheekWidth: 1,
  jawWidth: 1,
  hair: "crewcut",
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: { olive: "#C8A07A" } as const,
  hair: {
    crew: "#2B201A", // dark brown/near-black
    crewHi: "rgba(255,255,255,0.08)",
  },
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--skin": PALETTE.skin[recipe.skinTone],
    "--hair": PALETTE.hair.crew,
  };
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

// ✅ Paste your exact “perfect default” head d here if it differs.
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
    return PERFECT_DEFAULT_D; // EXACT string
  }

  const cx = 256;
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;

  // ✅ Shift cheek “hot zone” ~10% LOWER: 0.45 -> 0.55
  const weightAtY = (y: number) => {
    const t = clamp((y - yTop) / (yBottom - yTop), 0, 1);

    // Cheek influence peak moved down (0.55)
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

/**
 * Crew cut hair:
 * - Draw a “cap” over the top of the head
 * - Clip it to the head silhouette so it hugs perfectly
 * - Hairline position moves with faceLength (so it stays natural)
 */
function crewCutHairPath(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);

  // Reference face vertical bounds used by head morphing
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  const ty = (y: number) => cy + (y - cy) * faceLength;

  // Hairline sits ~33% down from top by default; tweakable later
  const hairlineY = ty(84 + (372 - 84) * 0.33);

  // A simple cap shape spanning the top; clipping ensures it matches head outline.
  // This is intentionally slightly larger than the head; clip will trim it perfectly.
  return `
    M 96 ${ty(40)}
    C 160 ${ty(20)} 352 ${ty(20)} 416 ${ty(40)}
    C 440 ${ty(90)} 418 ${hairlineY} 256 ${hairlineY}
    C 94 ${hairlineY} 72 ${ty(90)} 96 ${ty(40)}
    Z
  `.replace(/\s+/g, " ").trim();
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hairD = crewCutHairPath(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>
  </defs>

  <!-- Hair (clipped to head so it hugs perfectly) -->
  <g id="hair" clip-path="url(#clipHead)">
    <path class="ol" fill="var(--hair)" d="${hairD}" />
    <!-- subtle highlight band -->
    <path fill="${PALETTE.hair.crewHi}" d="
      M 140 118
      C 210 86 302 86 372 118
      C 322 110 190 110 140 118
      Z
    " clip-path="url(#clipHead)"/>
  </g>

  <!-- Head on top so outline stays crisp -->
  <g id="base-head">
    <path class="ol" fill="var(--skin)" d="${headD}" />
  </g>
</svg>
`.trim();
}
