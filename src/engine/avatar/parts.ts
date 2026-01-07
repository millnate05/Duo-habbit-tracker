import type { AvatarRecipe } from "./types";
 
export const palette = {
  outline: "#141414",
  shadow: "rgba(0,0,0,0.12)",
  highlight: "rgba(255,255,255,0.22)",
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
  pants: "#1F2937",
  shoes: {
    sh1: "#FFFFFF",
    sh2: "#111827",
  },
} as const;

export const viewBox = "0 0 320 520";

/**
 * A rounder, cuter head shape than the old one (closer to Bitmoji proportions).
 * Also easier to align hair and ears to it.
 */
export const headPathD =
  "M160 46 C122 46 96 76 96 118 C96 164 124 200 160 200 C196 200 224 164 224 118 C224 76 198 46 160 46 Z";

export function svgStyleVars(recipe: AvatarRecipe) {
  return {
    outline: palette.outline,
    shadow: palette.shadow,
    highlight: palette.highlight,
    skin: palette.skin[recipe.skin],
    hair: palette.hair[recipe.hairColor],
    outfit: palette.outfit[recipe.outfit],
    pants: palette.pants,
    shoes: palette.shoes[recipe.shoes],
  };
}

// -------------------------
// Layers (base → top)
// -------------------------

/**
 * BODY BASE = head + ears + neck
 * (No torso here — torso is in layerOutfit so clothes can define silhouette)
 */
export function layerBody(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  return `
  <g id="body">
    <!-- ears (behind head a bit) -->
    <path d="M92 122 C78 126 78 150 92 156 C104 162 110 150 108 140 C106 130 100 120 92 122 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M228 122 C242 126 242 150 228 156 C216 162 210 150 212 140 C214 130 220 120 228 122 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- head -->
    <path d="${headPathD}"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- cheek shading -->
    <path d="M118 138 C124 164 136 176 150 182" fill="none" stroke="${c.shadow}" stroke-width="10" stroke-linecap="round"/>
    <path d="M202 138 C196 164 184 176 170 182" fill="none" stroke="${c.shadow}" stroke-width="10" stroke-linecap="round"/>

    <!-- neck -->
    <path d="M144 190 C144 210 176 210 176 190 L176 170 C176 162 144 162 144 170 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
  </g>
  `;
}

/**
 * Face: fewer lines, more "clean cartoon"
 * - bigger eyes with whites + pupils
 * - brows sit higher and look less angry
 * - nose smaller
 * - mouth smoother
 */
export function layerFace(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  const brows =
    recipe.brows === "b1"
      ? `
      <path d="M118 108 C134 100 146 100 158 108" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      <path d="M162 108 C174 100 186 100 202 108" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      `
      : `
      <path d="M118 110 C134 116 146 118 158 110" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      <path d="M162 110 C174 118 186 116 202 110" fill="none" stroke="${c.outline}" stroke-width="5" stroke-linecap="round"/>
      `;

  const eyes =
    recipe.eyes === "e1"
      ? `
      <!-- left eye -->
      <ellipse cx="140" cy="130" rx="14" ry="11" fill="#fff" stroke="${c.outline}" stroke-width="4"/>
      <circle cx="144" cy="132" r="6" fill="${c.outline}"/>
      <circle cx="146" cy="130" r="2" fill="#fff"/>

      <!-- right eye -->
      <ellipse cx="180" cy="130" rx="14" ry="11" fill="#fff" stroke="${c.outline}" stroke-width="4"/>
      <circle cx="176" cy="132" r="6" fill="${c.outline}"/>
      <circle cx="178" cy="130" r="2" fill="#fff"/>
      `
      : `
      <!-- e2: slightly smiling eyes -->
      <path d="M125 132 C132 118 148 118 155 132" fill="#fff" stroke="${c.outline}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="141" cy="134" r="5" fill="${c.outline}"/>
      <circle cx="143" cy="132" r="2" fill="#fff"/>

      <path d="M165 132 C172 118 188 118 195 132" fill="#fff" stroke="${c.outline}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="179" cy="134" r="5" fill="${c.outline}"/>
      <circle cx="181" cy="132" r="2" fill="#fff"/>
      `;

  const nose = `
    <path d="M160 140 C156 150 156 156 164 160" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
  `;

  const mouth =
    recipe.mouth === "m1"
      ? `<path d="M140 174 C150 186 170 186 180 174" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M140 176 C150 170 170 170 180 176" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`;

  return `
  <g id="face">
    ${brows}
    ${eyes}
    ${nose}
    ${mouth}
  </g>
  `;
}

/**
 * Hair v2:
 * - no "helmet cap"
 * - uses hairline + top mass + optional bangs
 * - sits ON the head shape and frames it
 */
export function layerHair(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  if (recipe.hair === "h0") return "";

  // Back mass (behind head) — adds depth, reduces "cap" look
  const back = `
    <path d="M106 92 C116 62 136 52 160 52 C184 52 204 62 214 92
             C206 80 192 74 160 74 C128 74 114 80 106 92 Z"
      fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
  `;

  if (recipe.hair === "h1") {
    // clean short
    return `
    <g id="hair">
      ${back}
      <path d="M110 98 C118 78 134 66 160 66 C186 66 202 78 210 98
               C198 90 184 86 160 86 C136 86 122 90 110 98 Z"
        fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M124 84 C136 74 150 70 160 70 C176 70 190 76 198 84"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round"/>
    </g>
    `;
  }

  if (recipe.hair === "h2") {
    // messy top
    return `
    <g id="hair">
      ${back}
      <path d="M108 104
        C112 76 134 62 160 62
        C186 62 208 76 212 104
        C198 92 186 92 170 94
        C154 96 144 110 130 108
        C118 106 112 108 108 104 Z"
        fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    </g>
    `;
  }

  if (recipe.hair === "h3") {
    // curls
    return `
    <g id="hair">
      ${back}
      <circle cx="124" cy="82" r="12" fill="${c.hair}" stroke="${c.outline}" stroke-width="4"/>
      <circle cx="150" cy="72" r="13" fill="${c.hair}" stroke="${c.outline}" stroke-width="4"/>
      <circle cx="176" cy="72" r="13" fill="${c.hair}" stroke="${c.outline}" stroke-width="4"/>
      <circle cx="198" cy="82" r="12" fill="${c.hair}" stroke="${c.outline}" stroke-width="4"/>
      <path d="M112 104 C124 88 140 84 160 84 C180 84 196 88 208 104"
        fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    </g>
    `;
  }

  if (recipe.hair === "h4") {
    // side part
    return `
    <g id="hair">
      ${back}
      <path d="M108 104 C118 70 142 60 160 60 C188 60 208 74 212 104
               C198 86 178 80 164 82 C146 86 136 100 120 106
               C114 108 110 108 108 104 Z"
        fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M134 78 C150 66 168 66 190 74" fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round"/>
    </g>
    `;
  }

  // h5: longer fringe/bangs
  return `
  <g id="hair">
    ${back}
    <path d="M108 104 C118 70 140 58 160 58 C188 58 208 72 212 104
             C204 92 192 86 178 86
             C162 86 150 98 140 104
             C128 112 118 112 108 104 Z"
      fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M124 112 C138 126 150 130 160 130 C170 130 186 124 196 112"
      fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
  </g>
  `;
}

/**
 * Outfit v2:
 * - defined shoulders + waist (no balloon)
 * - arms + hands exist and look attached
 */
export function layerOutfit(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  const hoodie = recipe.outfit === "o2";

  return `
  <g id="outfit">
    <!-- left arm -->
    <path d="M102 232 C82 246 72 274 78 304 C82 322 98 328 112 318
             C104 292 108 266 126 246 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- right arm -->
    <path d="M218 232 C238 246 248 274 242 304 C238 322 222 328 208 318
             C216 292 212 266 194 246 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- hands -->
    <path d="M90 312 C86 330 100 344 118 338 C130 334 132 320 124 312
             C114 300 96 298 90 312 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <path d="M230 312 C234 330 220 344 202 338 C190 334 188 320 196 312
             C206 300 224 298 230 312 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- torso -->
    <path d="M110 214
      C124 200 142 194 160 194
      C178 194 196 200 210 214
      C228 232 236 258 236 288
      L236 318
      C236 356 212 380 176 380
      L144 380
      C108 380 84 356 84 318
      L84 288
      C84 258 92 232 110 214 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- neckline -->
    ${
      hoodie
        ? `
      <path d="M124 222 C124 198 142 182 160 182 C178 182 196 198 196 222
               C184 212 174 210 160 210 C146 210 136 212 124 222 Z"
        fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
      <path d="M132 304 C140 330 180 330 188 304"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round"/>
        `
        : `
      <path d="M136 204 C146 216 174 216 184 204"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round"/>
        `
    }

    <!-- sleeve seams -->
    <path d="M120 252 C110 262 106 276 108 290" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="6" stroke-linecap="round"/>
    <path d="M200 252 C210 262 214 276 212 290" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="6" stroke-linecap="round"/>
  </g>
  `;
}

/**
 * Legs v2:
 * - proper hips
 * - tapered legs
 * - shoes aligned and less "flat wedges"
 */
export function layerLegsAndShoes(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  return `
  <g id="legs">
    <!-- hips -->
    <path d="M134 380 C144 398 176 398 186 380 L186 366 L134 366 Z"
      fill="${c.pants}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- left leg -->
    <path d="M134 396
      C138 420 138 446 136 472
      C136 490 154 492 166 484
      L166 472
      C162 444 160 420 160 396 Z"
      fill="${c.pants}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- right leg -->
    <path d="M186 396
      C182 420 182 446 184 472
      C184 490 166 492 154 484
      L154 472
      C158 444 160 420 160 396 Z"
      fill="${c.pants}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- left shoe -->
    <path d="M118 472 C122 492 152 498 170 486 C176 482 176 472 176 472 Z"
      fill="${c.shoes}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- right shoe -->
    <path d="M202 472 C198 492 168 498 150 486 C144 482 144 472 144 472 Z"
      fill="${c.shoes}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- shoe crease -->
    <path d="M132 482 C142 490 154 490 164 482" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="5" stroke-linecap="round"/>
    <path d="M156 482 C166 490 178 490 188 482" fill="none" stroke="rgba(0,0,0,0.12)" stroke-width="5" stroke-linecap="round"/>
  </g>
  `;
}

export function layerAccessory(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  if (recipe.accessory === "a0") return "";

  // glasses
  return `
  <g id="accessory">
    <rect x="118" y="120" width="44" height="28" rx="12"
      fill="rgba(255,255,255,0.12)" stroke="${c.outline}" stroke-width="4"/>
    <rect x="158" y="120" width="44" height="28" rx="12"
      fill="rgba(255,255,255,0.12)" stroke="${c.outline}" stroke-width="4"/>
    <path d="M162 134 L162 134" stroke="${c.outline}" stroke-width="6" stroke-linecap="round"/>
  </g>
  `;
}
