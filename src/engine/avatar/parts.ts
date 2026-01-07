import type { AvatarRecipe } from "./types";

export const palette = {
  outline: "#151515",
  shadow: "rgba(0,0,0,0.14)",
  highlight: "rgba(255,255,255,0.22)",
  skinShadow: "rgba(0,0,0,0.08)",
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
  shirtShadow: "rgba(0,0,0,0.10)",
} as const;

/**
 * Bust/half-body viewBox (Bitmoji-like card framing)
 */
export const viewBoxBust = "0 0 320 380";

/**
 * Rounder head, slightly taller than wide.
 * This reads much closer to Bitmoji Deluxe than the old head.
 */
export const headPathD =
  "M160 44 C124 44 98 72 98 116 C98 164 128 200 160 200 C192 200 222 164 222 116 C222 72 196 44 160 44 Z";

export function svgStyleVars(recipe: AvatarRecipe) {
  return {
    outline: palette.outline,
    shadow: palette.shadow,
    highlight: palette.highlight,
    skinShadow: palette.skinShadow,
    skin: palette.skin[recipe.skin],
    hair: palette.hair[recipe.hairColor],
    outfit: palette.outfit[recipe.outfit],
    shirtShadow: palette.shirtShadow,
  };
}

/**
 * BUST BODY:
 * - background disc behind head (subtle)
 * - ears + head + neck + under-chin shadow
 */
export function layerBodyBust(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  return `
  <g id="bodyBust">
    <!-- subtle backdrop circle (helps the avatar read like Bitmoji cards) -->
    <circle cx="160" cy="140" r="128" fill="rgba(255,255,255,0.04)"/>

    <!-- ears -->
    <path d="M94 126 C80 130 80 154 94 160 C108 166 114 152 112 142 C110 132 104 124 94 126 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4"/>
    <path d="M226 126 C240 130 240 154 226 160 C212 166 206 152 208 142 C210 132 216 124 226 126 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4"/>

    <!-- head -->
    <path d="${headPathD}" fill="${c.skin}" stroke="${c.outline}" stroke-width="4"/>

    <!-- under-chin shadow -->
    <path d="M130 188 C144 204 176 204 190 188"
      fill="none" stroke="${c.skinShadow}" stroke-width="12" stroke-linecap="round"/>

    <!-- neck -->
    <path d="M144 188 C144 212 176 212 176 188 L176 168 C176 160 144 160 144 168 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4"/>
  </g>
  `;
}

/**
 * Hair BACK layer (behind head) — this is the #1 trick to avoid helmet hair.
 * Clip not required here; it sits behind the head.
 */
export function layerHairBack(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  if (recipe.hair === "h0") return "";

  // a soft “back mass” that peeks around the head edges
  return `
  <g id="hairBack">
    <path d="M108 94
      C118 60 138 46 160 46
      C182 46 202 60 212 94
      C206 84 194 78 160 78
      C126 78 114 84 108 94 Z"
      fill="${c.hair}" stroke="${c.outline}" stroke-width="4"/>
  </g>
  `;
}

/**
 * Deluxe Face:
 * - bigger eyes with whites + iris + pupil + sparkle
 * - brows calmer and higher
 * - nose smaller
 * - mouth smoother
 */
export function layerFaceDeluxe(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  const brows =
    recipe.brows === "b1"
      ? `
      <path d="M118 108 C134 98 148 98 160 108" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      <path d="M160 108 C172 98 186 98 202 108" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      `
      : `
      <path d="M118 112 C134 120 148 120 160 112" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      <path d="M160 112 C172 120 186 120 202 112" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      `;

  const eyes =
    recipe.eyes === "e1"
      ? `
      <!-- left eye -->
      <ellipse cx="138" cy="132" rx="16" ry="12" fill="#fff" stroke="${c.outline}" stroke-width="4"/>
      <circle cx="142" cy="134" r="7" fill="${c.outline}"/>
      <circle cx="144" cy="132" r="2.2" fill="#fff"/>

      <!-- right eye -->
      <ellipse cx="182" cy="132" rx="16" ry="12" fill="#fff" stroke="${c.outline}" stroke-width="4"/>
      <circle cx="178" cy="134" r="7" fill="${c.outline}"/>
      <circle cx="180" cy="132" r="2.2" fill="#fff"/>
      `
      : `
      <!-- e2: slightly relaxed eyes -->
      <path d="M120 134 C128 120 148 120 156 134" fill="#fff" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="140" cy="136" r="6" fill="${c.outline}"/>
      <circle cx="142" cy="134" r="2" fill="#fff"/>

      <path d="M164 134 C172 120 192 120 200 134" fill="#fff" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
      <circle cx="180" cy="136" r="6" fill="${c.outline}"/>
      <circle cx="182" cy="134" r="2" fill="#fff"/>
      `;

  const nose = `
    <path d="M160 142 C156 150 156 156 164 160"
      fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
  `;

  const mouth =
    recipe.mouth === "m1"
      ? `<path d="M140 174 C150 186 170 186 180 174" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M140 176 C150 170 170 170 180 176" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`;

  // tiny blush hint (very subtle)
  const blush = `
    <circle cx="120" cy="160" r="10" fill="rgba(255,105,135,0.06)"/>
    <circle cx="200" cy="160" r="10" fill="rgba(255,105,135,0.06)"/>
  `;

  return `
  <g id="faceDeluxe">
    ${brows}
    ${eyes}
    ${nose}
    ${mouth}
    ${blush}
  </g>
  `;
}

/**
 * Hair FRONT layer: hairline + top mass + optional bangs.
 * Uses headClip so hair sits naturally on the head.
 */
export function layerHairFront(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  if (recipe.hair === "h0") return "";

  const common = `fill="${c.hair}" stroke="${c.outline}" stroke-width="4" clip-path="url(#headClip)"`;

  if (recipe.hair === "h1") {
    // clean short
    return `
    <g id="hairFront">
      <path d="M112 104 C120 74 140 62 160 62 C180 62 200 74 208 104
               C196 92 184 88 160 88 C136 88 124 92 112 104 Z"
        ${common}/>
      <path d="M128 86 C140 76 152 74 160 74 C174 74 188 80 196 86"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round" clip-path="url(#headClip)"/>
    </g>
    `;
  }

  if (recipe.hair === "h2") {
    // messy
    return `
    <g id="hairFront">
      <path d="M110 106
        C112 76 138 60 160 60
        C182 60 208 76 210 106
        C198 94 186 92 170 94
        C154 96 146 110 132 108
        C120 106 114 110 110 106 Z"
        ${common}/>
    </g>
    `;
  }

  if (recipe.hair === "h3") {
    // curls front
    return `
    <g id="hairFront">
      <circle cx="126" cy="86" r="12" ${common}/>
      <circle cx="150" cy="76" r="13" ${common}/>
      <circle cx="176" cy="76" r="13" ${common}/>
      <circle cx="196" cy="86" r="12" ${common}/>
      <path d="M114 110 C126 94 142 90 160 90 C178 90 194 94 206 110" ${common}/>
    </g>
    `;
  }

  if (recipe.hair === "h4") {
    // side part
    return `
    <g id="hairFront">
      <path d="M110 106 C120 72 144 58 160 58 C188 58 206 72 210 106
               C198 88 178 82 164 84 C146 88 136 102 120 108
               C114 110 112 110 110 106 Z"
        ${common}/>
      <path d="M136 80 C150 70 170 70 190 78"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round" clip-path="url(#headClip)"/>
    </g>
    `;
  }

  // h5: bangs
  return `
  <g id="hairFront">
    <path d="M110 106 C120 70 140 56 160 56 C188 56 206 70 210 106
             C202 94 190 88 176 88
             C160 88 150 100 140 106
             C128 114 118 114 110 106 Z"
      ${common}/>
    <path d="M128 112 C140 126 150 130 160 130 C170 130 186 124 196 112"
      fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round" clip-path="url(#headClip)"/>
  </g>
  `;
}

/**
 * Outfit BUST:
 * Shoulders + sleeves + chest shape.
 * A tiny hint of arms so it reads like the Bitmoji base (without full-body complexity).
 */
export function layerOutfitBust(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  const hoodie = recipe.outfit === "o2";

  return `
  <g id="outfitBust">
    <!-- shoulders + sleeves -->
    <path d="M92 220
      C112 202 134 196 160 196
      C186 196 208 202 228 220
      C246 236 254 260 254 292
      C254 328 230 352 194 352
      L126 352
      C90 352 66 328 66 292
      C66 260 74 236 92 220 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4"/>

    <!-- subtle chest shading -->
    <path d="M96 246 C118 228 142 222 160 222 C178 222 202 228 224 246"
      fill="none" stroke="${c.shirtShadow}" stroke-width="10" stroke-linecap="round"/>

    ${
      hoodie
        ? `
      <!-- hood -->
      <path d="M120 220 C120 196 140 178 160 178 C180 178 200 196 200 220
               C186 212 176 210 160 210 C144 210 134 212 120 220 Z"
        fill="${c.outfit}" stroke="${c.outline}" stroke-width="4"/>
      <!-- hoodie pocket hint -->
      <path d="M128 300 C140 324 180 324 192 300"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round"/>
        `
        : `
      <!-- tee collar -->
      <path d="M136 206 C146 218 174 218 184 206"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round"/>
        `
    }
  </g>
  `;
}

export function layerAccessory(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  if (recipe.accessory === "a0") return "";

  return `
  <g id="accessory">
    <rect x="118" y="122" width="44" height="28" rx="12"
      fill="rgba(255,255,255,0.12)" stroke="${c.outline}" stroke-width="4"/>
    <rect x="158" y="122" width="44" height="28" rx="12"
      fill="rgba(255,255,255,0.12)" stroke="${c.outline}" stroke-width="4"/>
    <path d="M162 136 L162 136" stroke="${c.outline}" stroke-width="6" stroke-linecap="round"/>
  </g>
  `;
}
