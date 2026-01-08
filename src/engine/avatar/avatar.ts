// src/engine/avatar/avatar.ts
// v5.1 — Helmet baseline + sideburns
// Changes requested:
// - Hairline retract additional 20% (higher up)
// - Main hair lighten ~8%
// - Sideburns keep old color and protrude ~15% from new hairline width
// - Sideburns symmetric and intentionally stick out

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
    // Original (kept for sideburns)
    sideburn: "#8F2A17",
    // Lightened ~8% from #8F2A17 -> #983B2A
    main: "#983B2A",
  } as const,
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--skin": PALETTE.skin[recipe.skinTone],
    "--hair": PALETTE.hair.main,
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
   HAIR (helmet + sideburns)
========================= */

function faceTy(recipe: AvatarRecipe) {
  const faceLength = clamp(recipe.faceLength, 0.5, 1.5);
  const yTop = 84;
  const yBottom = 372;
  const cy = (yTop + yBottom) / 2;
  return (y: number) => cy + (y - cy) * faceLength;
}

function helmetAndSideburns(recipe: AvatarRecipe) {
  const ty = faceTy(recipe);

  // Head reference X bounds from your head path (roughly)
  // We'll keep helmet tight to head, but allow sideburns to protrude.
  const headXL = 170;
  const headXR = 342;

  // Helmet tightness: "barely stick out"
  const sideInset = 16;
  const xL = headXL - sideInset;
  const xR = headXR + sideInset;

  // --- Hairline retract additional ~20% ---
  // Previous hairline was ty(110). Distance from yTop (84) was 26.
  // Retract 20% => 26 * 0.8 = 20.8 => y ≈ 104.8 (higher / more forehead)
  const hairlineY = ty(104.8);

  // Top sticks out same as sides (helmet look)
  const topLift = sideInset; // equals side extension
  const crownY = ty(84 - topLift);

  // Sideburn protrusion: "15% from the new hairline"
  // Interpreting as 15% of hair width at hairline.
  const hairWidth = xR - xL;
  const sideburnOut = hairWidth * 0.15;

  const xLSB = xL - sideburnOut;
  const xRSB = xR + sideburnOut;

  // Sideburn vertical span
  const sbTop = hairlineY + 10; // starts just below the hairline curve
  const sbBot = ty(250);        // down to about temple/upper cheek area

  // Helmet main mass (CLIPPED to head so it doesn't spill into face)
  const helmet = `
    M ${xL} ${hairlineY}
    C 210 ${hairlineY - 18} 302 ${hairlineY - 18} ${xR} ${hairlineY}
    C ${xR + 2} ${crownY + 18} ${xR - 10} ${crownY} 256 ${crownY}
    C ${xL + 10} ${crownY} ${xL - 2} ${crownY + 18} ${xL} ${hairlineY}
    Z
  `.replace(/\s+/g, " ").trim();

  // Sideburns (NOT clipped, so they can stick out)
  // Symmetrical simple blocks with slightly rounded edges.
  const sideburnL = `
    M ${xL} ${sbTop}
    C ${xLSB + 6} ${sbTop} ${xLSB + 2} ${sbBot - 10} ${xL} ${sbBot}
    L ${xL + 12} ${sbBot}
    C ${xL + 6} ${sbBot - 10} ${xL + 6} ${sbTop + 8} ${xL} ${sbTop}
    Z
  `.replace(/\s+/g, " ").trim();

  const sideburnR = `
    M ${xR} ${sbTop}
    C ${xRSB - 6} ${sbTop} ${xRSB - 2} ${sbBot - 10} ${xR} ${sbBot}
    L ${xR - 12} ${sbBot}
    C ${xR - 6} ${sbBot - 10} ${xR - 6} ${sbTop + 8} ${xR} ${sbTop}
    Z
  `.replace(/\s+/g, " ").trim();

  // Outline cover for top of head so outline doesn't cut through hair
  const outlineCover = `
    M ${xL - sideburnOut - 10} ${ty(60)}
    C 150 ${ty(18)} 362 ${ty(18)} ${xR + sideburnOut + 10} ${ty(60)}
    C ${xR + sideburnOut + 24} ${ty(110)} ${xR + sideburnOut + 18} ${ty(230)} 256 ${ty(236)}
    C ${xL - sideburnOut - 18} ${ty(230)} ${xL - sideburnOut - 24} ${ty(110)} ${xL - sideburnOut - 10} ${ty(60)}
    Z
  `.replace(/\s+/g, " ").trim();

  return { helmet, sideburnL, sideburnR, outlineCover };
}

/* =========================
   RENDER
========================= */

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const headD = morphedHeadPath(recipe);
  const hair = helmetAndSideburns(recipe);

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; fill: none; }
  </style>

  <defs>
    <clipPath id="clipHead">
      <path d="${headD}" />
    </clipPath>

    <mask id="maskOutlineUnderHair">
      <rect x="0" y="0" width="512" height="512" fill="white" />
      <path d="${hair.outlineCover}" fill="black" />
    </mask>
  </defs>

  <!-- Head fill -->
  <path d="${headD}" fill="var(--skin)" />

  <!-- Sideburns (darker, protruding, symmetric) -->
  <path d="${hair.sideburnL}" fill="${PALETTE.hair.sideburn}" />
  <path d="${hair.sideburnR}" fill="${PALETTE.hair.sideburn}" />

  <!-- Helmet hair mass (lightened ~8%), clipped to head -->
  <path d="${hair.helmet}" fill="var(--hair)" clip-path="url(#clipHead)" />

  <!-- Head outline (masked so it doesn't show through hair area) -->
  <g mask="url(#maskOutlineUnderHair)">
    <path d="${headD}" class="ol" />
  </g>
</svg>
`.trim();
}
