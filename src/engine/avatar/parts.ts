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
} as const;

// ViewBox for full body
export const viewBox = "0 0 320 520";

// Shared head shape (used for both drawing + hair clipping)
export const headPathD =
  "M160 40 C110 40 92 78 92 118 C92 170 122 202 160 202 C198 202 228 170 228 118 C228 78 210 40 160 40 Z";

// Helper to keep style consistent
export function svgStyleVars(recipe: AvatarRecipe) {
  return {
    outline: palette.outline,
    shadow: palette.shadow,
    skin: palette.skin[recipe.skin],
    hair: palette.hair[recipe.hairColor],
    outfit: palette.outfit[recipe.outfit],
    shoes: palette.shoes[recipe.shoes],
  };
}

// -------------------------
// Layers (base → top)
// -------------------------

export function layerBody(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  return `
  <g id="body">
    <!-- head -->
    <path d="${headPathD}"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- neck -->
    <path d="M146 148 C146 170 174 170 174 148 L174 132 C174 118 146 118 146 132 Z"
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

// Hair is clipped to head so it "sits" right.
// render.ts defines <clipPath id="headClip"> using headPathD.
export function layerHair(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  if (recipe.hair === "h0") return "";

  const common = `fill="${c.hair}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round" clip-path="url(#headClip)"`;

  if (recipe.hair === "h1") {
    // clean short
    return `
    <g id="hair">
      <path d="M92 118 C98 72 124 44 160 44 C196 44 222 72 228 118
               C212 98 192 88 160 88 C128 88 108 98 92 118 Z" ${common}/>
      <path d="M112 76 C128 62 148 58 160 58 C182 58 198 64 210 76"
        fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round" clip-path="url(#headClip)"/>
    </g>`;
  }

  if (recipe.hair === "h2") {
    // messy top
    return `
    <g id="hair">
      <path d="M92 120 C94 78 120 54 160 54 C204 54 228 78 228 120
               C214 110 200 108 184 108 C160 108 144 120 124 116
               C108 112 98 114 92 120 Z" ${common}/>
    </g>`;
  }

  if (recipe.hair === "h3") {
    // curly top
    return `
    <g id="hair">
      <path d="M92 120 C92 82 118 54 160 54 C204 54 228 82 228 120
               C216 104 200 96 182 96 C170 96 160 102 150 104
               C136 108 120 106 106 116 C100 120 96 122 92 120 Z" ${common}/>
      <circle cx="120" cy="78" r="10" fill="${c.hair}" stroke="${c.outline}" stroke-width="4" clip-path="url(#headClip)"/>
      <circle cx="150" cy="70" r="11" fill="${c.hair}" stroke="${c.outline}" stroke-width="4" clip-path="url(#headClip)"/>
      <circle cx="182" cy="74" r="10" fill="${c.hair}" stroke="${c.outline}" stroke-width="4" clip-path="url(#headClip)"/>
    </g>`;
  }

  if (recipe.hair === "h4") {
    // side part
    return `
    <g id="hair">
      <path d="M92 120 C96 74 130 44 160 44 C204 44 226 72 228 120
               C214 92 188 84 166 86 C142 88 124 104 110 116 C104 120 98 122 92 120 Z" ${common}/>
      <path d="M120 70 C138 56 162 54 190 62"
        fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="6" stroke-linecap="round" clip-path="url(#headClip)"/>
    </g>`;
  }

  // h5: longer fringe
  return `
  <g id="hair">
    <path d="M92 120 C96 72 130 44 160 44 C198 44 222 72 228 120
             C218 100 202 92 182 92 C160 92 146 106 132 112
             C118 118 108 120 92 120 Z" ${common}/>
    <path d="M118 116 C132 132 150 140 160 140 C170 140 186 132 202 116"
      fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round" clip-path="url(#headClip)"/>
  </g>`;
}

// Torso + arms + hands = defined silhouette (no more blob)
export function layerOutfit(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  const hoodie = recipe.outfit === "o2";

  return `
  <g id="outfit">
    <!-- arms (behind torso) -->
    <path d="M78 240 C60 260 56 292 68 322 C74 338 92 340 102 326 C86 300 88 272 108 252 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M242 240 C260 260 264 292 252 322 C246 338 228 340 218 326 C234 300 232 272 212 252 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- hands -->
    <path d="M92 330 C88 346 100 360 116 356 C126 354 130 342 124 334 C116 324 98 320 92 330 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M228 330 C232 346 220 360 204 356 C194 354 190 342 196 334 C204 324 222 320 228 330 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- torso (shoulders + waist) -->
    <path d="M92 214
      C110 194 132 184 160 184
      C188 184 210 194 228 214
      C242 230 248 254 250 280
      L250 312
      C248 350 226 372 192 372
      L128 372
      C94 372 72 350 70 312
      L70 280
      C72 254 78 230 92 214 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    ${
      hoodie
        ? `
      <!-- hood -->
      <path d="M104 214
        C104 188 128 166 160 166
        C192 166 216 188 216 214
        C202 206 184 202 160 202
        C136 202 118 206 104 214 Z"
        fill="${c.outfit}" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>
      <!-- pocket -->
      <path d="M122 300 C136 330 184 330 198 300"
        fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="6" stroke-linecap="round"/>
    `
        : `
      <!-- tee collar -->
      <path d="M132 206 C146 220 174 220 188 206"
        fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="6" stroke-linecap="round"/>
    `
    }

    <!-- sleeve seams -->
    <path d="M106 252 C94 262 88 278 92 292" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="6" stroke-linecap="round"/>
    <path d="M214 252 C226 262 232 278 228 292" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="6" stroke-linecap="round"/>
  </g>
  `;
}

// Better hips + tapered legs (less "rectangle pants")
export function layerLegsAndShoes(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  return `
  <g id="legs">
    <!-- pelvis -->
    <path d="M120 372 C132 392 188 392 200 372 L200 360 L120 360 Z"
      fill="#1F2937" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- left leg -->
    <path d="M122 392
      C126 412 128 440 126 470
      C125 488 142 490 154 482
      L154 470
      C150 438 150 414 150 392 Z"
      fill="#1F2937" stroke="${c.outline}" stroke-width="4" stroke-linejoin="round"/>

    <!-- right leg -->
    <path d="M198 392z
      " fill="none"/>
    <path d="M198 392
      C194 412 192 440 194 470
      C195 488 178 490 166 482
      L166 470
      C170 438 170 414 170 392 Z"
      fill="#1F2937" stroke="${c.o
