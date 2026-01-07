import type { AvatarRecipe } from "./types";

export const palette = {
  outline: "#1a1a1a",
  shadow: "rgba(0,0,0,0.10)",
  skin: {
    s1: "#F7D7C4",
    s2: "#EFC3A4",
    s3: "#E2AD8C",
    s4: "#C98C6A",
    s5: "#A86A4B",
    s6: "#7E4A34",
  },
  hair: {
    hc1: "#1E1B1A",
    hc2: "#4B2E24",
    hc3: "#8B5A2B",
    hc4: "#C9A26A",
  },
  outfit: {
    o1: "#2E5BFF", // tee
    o2: "#111827", // hoodie
  },
  shoes: {
    sh1: "#FFFFFF",
    sh2: "#111827",
  },
};

// All parts are authored to the SAME pose.
// ViewBox chosen so it's easy to scale everywhere.
export const viewBox = "0 0 320 520";

// Helper to keep style consistent.
export function svgStyleVars(recipe: AvatarRecipe) {
  return {
    outline: palette.outline,
    skin: palette.skin[recipe.skin],
    hair: palette.hair[recipe.hairColor],
    outfit: palette.outfit[recipe.outfit],
    shoes: palette.shoes[recipe.shoes],
  };
}

// --- Layers (base → top) ---
// You’ll grow these into proper paths. For now, they’re clean shapes that prove the system.
export function layerBody(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  return `
  <g id="body">
    <!-- neck -->
    <path d="M146 148 C146 170 174 170 174 148 L174 132 C174 118 146 118 146 132 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    <!-- head -->
    <path d="M160 40
      C110 40 92 78 92 118
      C92 170 122 202 160 202
      C198 202 228 170 228 118
      C228 78 210 40 160 40 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    <!-- subtle cheek shadow -->
    <path d="M112 132 C120 165 135 178 152 186" fill="none" stroke="${c.shadow}" stroke-width="10" stroke-linecap="round"/>
    <path d="M208 132 C200 165 185 178 168 186" fill="none" stroke="${c.shadow}" stroke-width="10" stroke-linecap="round"/>
  </g>
  `;
}

export function layerFace(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  const eyes =
    recipe.eyes === "e1"
      ? `
      <g id="eyes">
        <path d="M118 122 C132 110 146 110 160 122" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
        <path d="M160 122 C174 110 188 110 202 122" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="146" cy="128" r="6" fill="${c.outline}"/>
        <circle cx="174" cy="128" r="6" fill="${c.outline}"/>
        <circle cx="144" cy="126" r="2" fill="#fff"/>
        <circle cx="172" cy="126" r="2" fill="#fff"/>
      </g>
      `
      : `
      <g id="eyes">
        <path d="M114 126 C132 102 152 102 170 126" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
        <path d="M150 126 C168 102 188 102 206 126" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
        <circle cx="148" cy="130" r="5" fill="${c.outline}"/>
        <circle cx="172" cy="130" r="5" fill="${c.outline}"/>
      </g>
      `;

  const brows =
    recipe.brows === "b1"
      ? `
      <g id="brows">
        <path d="M118 106 C134 96 148 98 160 106" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
        <path d="M160 106 C172 98 186 96 202 106" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      </g>
      `
      : `
      <g id="brows">
        <path d="M118 104 C134 112 148 114 160 104" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
        <path d="M160 104 C172 114 186 112 202 104" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      </g>
      `;

  const mouth =
    recipe.mouth === "m1"
      ? `<path d="M140 164 C150 176 170 176 180 164" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M140 166 C150 158 170 158 180 166" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`;

  // simple nose
  const nose = `<path d="M160 132 C156 144 156 150 164 154" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`;

  return `
  <g id="face">
    ${brows}
    ${eyes}
    ${nose}
    ${mouth}
  </g>
  `;
}

export function layerHair(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  if (recipe.hair === "h0") return "";

  if (recipe.hair === "h1") {
    return `
    <g id="hair">
      <path d="M96 118
        C92 72 124 40 160 40
        C196 40 228 72 224 118
        C210 96 190 84 160 84
        C130 84 110 96 96 118 Z"
        fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M112 78 C128 62 148 58 160 58 C180 58 196 64 208 76"
        fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="6" stroke-linecap="round"/>
    </g>
    `;
  }

  // h2
  return `
  <g id="hair">
    <path d="M98 120
      C92 84 114 52 160 52
      C210 52 232 86 222 120
      C210 108 196 104 176 104
      C156 104 140 114 122 112
      C112 110 104 114 98 120 Z"
      fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
  </g>
  `;
}

export function layerOutfit(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  const hoodie = recipe.outfit === "o2";

  return `
  <g id="outfit">
    <!-- torso -->
    <path d="M92 210
      C110 190 130 182 160 182
      C190 182 210 190 228 210
      L250 310
      C250 340 230 360 200 360
      L120 360
      C90 360 70 340 70 310 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    ${hoodie ? `
      <!-- hood -->
      <path d="M104 214
        C104 188 128 166 160 166
        C192 166 216 188 216 214
        C202 206 184 202 160 202
        C136 202 118 206 104 214 Z"
        fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
      <!-- pocket -->
      <path d="M124 296 C136 320 184 320 196 296"
        fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="6" stroke-linecap="round"/>
    ` : `
      <!-- tee collar -->
      <path d="M132 206 C146 220 174 220 188 206"
        fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="6" stroke-linecap="round"/>
    `}
  </g>
  `;
}

export function layerLegsAndShoes(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  return `
  <g id="legs">
    <!-- pants -->
    <path d="M120 360 L148 360 L150 470 L118 470 Z"
      fill="#1F2937" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M172 360 L200 360 L202 470 L170 470 Z"
      fill="#1F2937" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- shoes -->
    <path d="M104 470 C110 486 138 490 154 482 L154 470 Z"
      fill="${c.shoes}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M166 470 C170 486 198 490 214 482 L214 470 Z"
      fill="${c.shoes}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- shoe highlight -->
    <path d="M114 476 C122 482 134 482 144 476" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="5" stroke-linecap="round"/>
    <path d="M176 476 C184 482 196 482 206 476" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="5" stroke-linecap="round"/>
  </g>
  `;
}

export function layerAccessory(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  if (recipe.accessory === "a0") return "";

  // simple glasses as a1
  return `
  <g id="accessory">
    <rect x="116" y="116" width="44" height="28" rx="10"
      fill="rgba(255,255,255,0.15)" stroke="${c.outline}" stroke-width="4"/>
    <rect x="160" y="116" width="44" height="28" rx="10"
      fill="rgba(255,255,255,0.15)" stroke="${c.outline}" stroke-width="4"/>
    <path d="M160 128 L160 128" stroke="${c.outline}" stroke-width="6" stroke-linecap="round"/>
  </g>
  `;
}

