// src/engine/avatar/avatar.ts
// v5 — Controlled helmet baseline
// Purpose:
// - Establish CORRECT geometry first (uniform hairline, clean sides, equal top/sides)
// - No highlights, no glare, no seams, no chunks
// - Dark, flat hair for pure silhouette evaluation

export type AvatarRecipe = {
  skinTone: "olive";
  faceLength: number;
  cheekWidth: number;
  jawWidth: number;
  hair: "helmetRed";
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
  faceLength: 1,
  cheekWidth: 1,
  jawWidth: 1,
  hair: "helmetRed",
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: { olive: "#C8A07A" } as const,
  hair: {
    helmetRed: "#8F2A17", // darker, flat, no glare
  },
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--skin": PALETTE.skin[recipe.skinTone],
    "--hair": PALETTE.hair.helmetRed,
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
   HELMET HAIR (NEW)
========================= */

function helmetHairPath(recipe: AvatarRecipe): string {
  // Key rules:
  // - Uniform curve hairline
  // - 30% higher than before
  // - Sides barely wider than head
  // - Top sticks out same amount as sides

  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  const ty = (y: number) => cy + (y - cy) * faceLength;

  // Head width reference
  const sideInset = 16; // minimal extension
  const xL = 170 - sideInset;
  const xR = 342 + sideInset;

  // Hairline moved UP ~30%
  const hairlineY = ty(110);

  // Top height equals side extension
  const topLift = sideInset;
  const crownY = ty(84 - topLift);

  return `
    M ${xL} ${hairlineY}
    C 210 ${hairlineY - 18} 302 ${hairlineY - 18} ${xR} ${hairlineY}
    L ${xR} ${ty(220)}
    C ${xR} ${ty(250)} ${xL} ${ty(250)} ${xL} ${ty(220)}
    Z

    M ${xL} ${hairlineY}
    C 190 ${crownY} 322 ${crownY} ${xR} ${hairlineY}
    Z
  `.replace(/\s+/g, " ").trim();
}

/* =========================
   RENDER
========================= */

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hairD = helmetHairPath(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; fill: none; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>
  </defs>

  <!-- Head -->
  <path d="${headD}" fill="var(--skin)" />

  <!-- Hair -->
  <path d="${hairD}" fill="var(--hair)" clip-path="url(#clipHead)" />

  <!-- Head outline -->
  <path d="${headD}" class="ol" />
</svg>
`.trim();
}
