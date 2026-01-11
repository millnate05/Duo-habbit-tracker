// Avatar Engine v2 — Full Body Parametric Reconstruction
// Math + geometry only (NO JSX)

export type AvatarRecipe = {
  skinTone: "light" | "olive" | "tan";
  bodyHeight: number;     // 0.8 – 1.2
  torsoWidth: number;     // 0.8 – 1.2
  headScale: number;      // 0.85 – 1.15
  eyeSpacing: number;     // 0.85 – 1.15
  legLength: number;      // 0.8 – 1.2
  hair: "short" | "none";
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
  bodyHeight: 1,
  torsoWidth: 1,
  headScale: 1,
  eyeSpacing: 1,
  legLength: 1,
  hair: "short",
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: {
    light: "#F1D0B5",
    olive: "#C8A07A",
    tan: "#A87452",
  },
  shirt: "#FFFFFF",
  vest: "#8C1D18",
  pants: "#1E2A3A",
  shoes: "#6B4A2D",
  hair: "#241812",
};

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  const skin = PALETTE.skin[recipe.skinTone];

  // Base proportions
  const H = 900 * clamp(recipe.bodyHeight, 0.8, 1.2);
  const centerX = 256;

  // Head
  const headR = 70 * clamp(recipe.headScale, 0.85, 1.15);
  const headCY = 120;

  // Eyes
  const eyeY = headCY - 10;
  const eyeOffset = 22 * clamp(recipe.eyeSpacing, 0.85, 1.15);
  const eyeR = 6;

  // Torso
  const torsoTop = headCY + headR + 10;
  const torsoH = 220;
  const torsoW = 120 * clamp(recipe.torsoWidth, 0.8, 1.2);

  // Legs
  const legTop = torsoTop + torsoH;
  const legH = 260 * clamp(recipe.legLength, 0.8, 1.2);
  const legGap = 20;

  return `
<svg xmlns="http://www.w3.org/2000/svg"
     viewBox="0 0 512 ${H}"
     width="${size}"
     height="${size * (H / 512)}"
     shape-rendering="geometricPrecision">

  <style>
    .ol { stroke: ${PALETTE.outline}; stroke-width: 4; stroke-linejoin: round; }
  </style>

  <!-- HEAD -->
  <circle cx="${centerX}" cy="${headCY}" r="${headR}" fill="${skin}" class="ol"/>

  <!-- EYES -->
  <circle cx="${centerX - eyeOffset}" cy="${eyeY}" r="${eyeR}" fill="#fff"/>
  <circle cx="${centerX + eyeOffset}" cy="${eyeY}" r="${eyeR}" fill="#fff"/>
  <circle cx="${centerX - eyeOffset}" cy="${eyeY}" r="3" fill="#111"/>
  <circle cx="${centerX + eyeOffset}" cy="${eyeY}" r="3" fill="#111"/>

  <!-- HAIR -->
  ${
    recipe.hair === "short"
      ? `<path d="
          M ${centerX - headR} ${headCY - headR}
          C ${centerX} ${headCY - headR * 1.4}
            ${centerX + headR} ${headCY - headR}
            ${centerX + headR} ${headCY - headR * 0.3}
          L ${centerX - headR} ${headCY - headR * 0.3}
          Z"
          fill="${PALETTE.hair}"/>`
      : ""
  }

  <!-- TORSO -->
  <rect
    x="${centerX - torsoW / 2}"
    y="${torsoTop}"
    width="${torsoW}"
    height="${torsoH}"
    rx="22"
    fill="${PALETTE.vest}"
    class="ol"/>

  <!-- SHIRT -->
  <rect
    x="${centerX - torsoW / 2 + 14}"
    y="${torsoTop + 16}"
    width="${torsoW - 28}"
    height="${torsoH - 32}"
    rx="18"
    fill="${PALETTE.shirt}"/>

  <!-- LEGS -->
  <rect
    x="${centerX - legGap / 2 - 36}"
    y="${legTop}"
    width="36"
    height="${legH}"
    rx="14"
    fill="${PALETTE.pants}"/>

  <rect
    x="${centerX + legGap / 2}"
    y="${legTop}"
    width="36"
    height="${legH}"
    rx="14"
    fill="${PALETTE.pants}"/>

  <!-- SHOES -->
  <rect
    x="${centerX - legGap / 2 - 42}"
    y="${legTop + legH}"
    width="52"
    height="22"
    rx="10"
    fill="${PALETTE.shoes}"/>

  <rect
    x="${centerX + legGap / 2}"
    y="${legTop + legH}"
    width="52"
    height="22"
    rx="10"
    fill="${PALETTE.shoes}"/>

</svg>
`.trim();
}
