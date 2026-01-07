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
    o1: "#2E5BFF",
    o2: "#111827",
  },
  // "Bitmoji-ish" eye colors (we can make this selectable later)
  iris: {
    i1: "#2F80ED", // blue
    i2: "#27AE60", // green
    i3: "#8E5A2B", // brown
    i4: "#111827", // dark
  },
} as const;

export const viewBoxBust = "0 0 320 380";

/**
 * Softer head (not perfect circle), slightly narrower jaw.
 */
export const headPathD =
  "M160 46 C126 46 100 74 100 116 C100 164 128 200 160 200 C192 200 220 164 220 116 C220 74 194 46 160 46 Z";

export function svgStyleVars(recipe: AvatarRecipe) {
  return {
    outline: palette.outline,
    shadow: palette.shadow,
    highlight: palette.highlight,
    skin: palette.skin[recipe.skin],
    hair: palette.hair[recipe.hairColor],
    outfit: palette.outfit[recipe.outfit],
    // default iris (until we add to recipe)
    iris: palette.iris.i3,
  };
}

export function layerBodyBust(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  return `
  <g id="bodyBust">
    <!-- soft backdrop ring -->
    <circle cx="160" cy="138" r="128" fill="rgba(255,255,255,0.04)"/>
    <circle cx="160" cy="138" r="92" fill="rgba(255,255,255,0.03)"/>

    <!-- ears (smaller + more natural) -->
    <path d="M102 132 C90 134 88 154 102 160 C114 166 120 154 118 144 C116 136 110 130 102 132 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4"/>
    <path d="M218 132 C230 134 232 154 218 160 C206 166 200 154 202 144 C204 136 210 130 218 132 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4"/>

    <!-- head -->
    <path d="${headPathD}"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4"/>

    <!-- under-chin shadow -->
    <path d="M132 190 C146 206 174 206 188 190"
      fill="none" stroke="${c.shadow}" stroke-width="12" stroke-linecap="round"/>

    <!-- neck -->
    <path d="M144 190 C144 214 176 214 176 190 L176 170 C176 162 144 162 144 170 Z"
      fill="${c.skin}" stroke="${c.outline}" stroke-width="4"/>
  </g>
  `;
}

/**
 * Hair BACK: creates depth so it stops looking like a helmet.
 */
export function layerHairBack(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  if (recipe.hair === "h0") return "";

  return `
  <g id="hairBack">
    <path d="M112 100
      C120 64 140 50 160 50
      C180 50 200 64 208 100
      C200 88 188 82 160 82
      C132 82 120 88 112 100 Z"
      fill="${c.hair}" stroke="${c.outline}" stroke-width="4"/>
  </g>
  `;
}

/**
 * Face V2 (Deluxe feel):
 * - layered eyes (white -> iris -> pupil -> highlight)
 * - upper eyelid line to reduce "staring"
 * - brows lighter
 * - nose = small nostrils (no long outline)
 */
export function layerFaceDeluxe(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);

  const brows =
    recipe.brows === "b1"
      ? `
      <path d="M120 110 C134 102 146 102 156 110" fill="none" stroke="${c.outline}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M164 110 C174 102 186 102 200 110" fill="none" stroke="${c.outline}" stroke-width="4.5" stroke-linecap="round"/>
      `
      : `
      <path d="M120 114 C134 120 146 120 156 114" fill="none" stroke="${c.outline}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M164 114 C174 120 186 120 200 114" fill="none" stroke="${c.outline}" stroke-width="4.5" stroke-linecap="round"/>
      `;

  const eyes =
    recipe.eyes === "e1"
      ? `
      <!-- eye whites -->
      <ellipse cx="140" cy="134" rx="16" ry="12" fill="#fff" stroke="${c.outline}" stroke-width="4"/>
      <ellipse cx="180" cy="134" rx="16" ry="12" fill="#fff" stroke="${c.outline}" stroke-width="4"/>

      <!-- iris -->
      <circle cx="144" cy="136" r="6.8" fill="${c.iris}"/>
      <circle cx="176" cy="136" r="6.8" fill="${c.iris}"/>

      <!-- pupil -->
      <circle cx="145.5" cy="137" r="4.2" fill="${c.outline}"/>
      <circle cx="174.5" cy="137" r="4.2" fill="${c.outline}"/>

      <!-- sparkle -->
      <circle cx="147.2" cy="135.6" r="1.7" fill="#fff"/>
      <circle cx="176.2" cy="135.6" r="1.7" fill="#fff"/>

      <!-- upper eyelid line (key bitmoji trick) -->
      <path d="M126 132 C134 124 146 124 154 132" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
      <path d="M166 132 C174 124 186 124 194 132" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
      `
      : `
      <!-- relaxed eyes -->
      <ellipse cx="140" cy="136" rx="15" ry="11" fill="#fff" stroke="${c.outline}" stroke-width="4"/>
      <ellipse cx="180" cy="136" rx="15" ry="11" fill="#fff" stroke="${c.outline}" stroke-width="4"/>
      <circle cx="144" cy="138" r="6.2" fill="${c.iris}"/>
      <circle cx="176" cy="138" r="6.2" fill="${c.iris}"/>
      <circle cx="145.5" cy="139" r="4" fill="${c.outline}"/>
      <circle cx="174.5" cy="139" r="4" fill="${c.outline}"/>
      <circle cx="147.2" cy="137.6" r="1.6" fill="#fff"/>
      <circle cx="176.2" cy="137.6" r="1.6" fill="#fff"/>
      <path d="M126 134 C134 126 146 126 154 134" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
      <path d="M166 134 C174 126 186 126 194 134" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
      `;

  // tiny nostrils instead of big outlined nose
  const nose = `
    <path d="M156 154 C158 158 162 158 164 154" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>
  `;

  const mouth =
    recipe.mouth === "m1"
      ? `<path d="M142 178 C150 186 170 186 178 178" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`
      : `<path d="M142 180 C150 176 170 176 178 180" fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round"/>`;

  return `
  <g id="faceDeluxe">
    ${brows}
    ${eyes}
    ${nose}
    ${mouth}
  </g>
  `;
}

/**
 * Hair FRONT: includes temples/sideburns + hairline.
 * This is what kills helmet hair.
 */
export function layerHairFront(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  if (recipe.hair === "h0") return "";

  const common = `fill="${c.hair}" stroke="${c.outline}" stroke-width="4" clip-path="url(#headClip)"`;

  const temples = `
    <path d="M112 128 C112 112 120 104 132 104 C124 114 122 126 124 138 C118 138 114 134 112 128 Z"
      ${common}/>
    <path d="M208 128 C208 112 200 104 188 104 C196 114 198 126 196 138 C202 138 206 134 208 128 Z"
      ${common}/>
  `;

  if (recipe.hair === "h1") {
    return `
    <g id="hairFront">
      ${temples}
      <path d="M114 110 C124 78 144 64 160 64 C176 64 196 78 206 110
               C194 96 182 90 160 90 C138 90 126 96 114 110 Z"
        ${common}/>
      <path d="M130 88 C140 78 152 76 160 76 C174 76 188 82 196 88"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round" clip-path="url(#headClip)"/>
    </g>
    `;
  }

  if (recipe.hair === "h2") {
    return `
    <g id="hairFront">
      ${temples}
      <path d="M114 112
        C116 82 140 64 160 64
        C180 64 204 82 206 112
        C194 98 184 96 170 98
        C154 100 146 112 132 110
        C120 108 116 114 114 112 Z"
        ${common}/>
    </g>
    `;
  }

  if (recipe.hair === "h3") {
    return `
    <g id="hairFront">
      ${temples}
      <circle cx="130" cy="88" r="12" ${common}/>
      <circle cx="150" cy="78" r="13" ${common}/>
      <circle cx="176" cy="78" r="13" ${common}/>
      <circle cx="194" cy="88" r="12" ${common}/>
      <path d="M118 114 C130 98 144 94 160 94 C176 94 190 98 202 114" ${common}/>
    </g>
    `;
  }

  if (recipe.hair === "h4") {
    return `
    <g id="hairFront">
      ${temples}
      <path d="M114 112 C124 78 146 62 160 62 C186 62 202 80 206 112
               C194 92 176 86 164 88 C146 92 136 108 122 114
               C118 116 116 116 114 112 Z"
        ${common}/>
      <path d="M138 84 C150 74 170 74 190 82"
        fill="none" stroke="${c.highlight}" stroke-width="6" stroke-linecap="round" clip-path="url(#headClip)"/>
    </g>
    `;
  }

  return `
  <g id="hairFront">
    ${temples}
    <path d="M114 112 C124 76 144 60 160 60 C186 60 202 76 206 112
             C198 98 188 92 176 92
             C160 92 150 104 142 110
             C132 118 122 118 114 112 Z"
      ${common}/>
    <path d="M132 116 C144 128 152 132 160 132 C168 132 182 126 190 116"
      fill="none" stroke="${c.outline}" stroke-width="4" stroke-linecap="round" clip-path="url(#headClip)"/>
  </g>
  `;
}

/**
 * Outfit BUST v2:
 * - No circle. Real shoulders + taper.
 * - Adds sleeve definition so it reads like a torso, not a balloon.
 */
export function layerOutfitBust(recipe: AvatarRecipe) {
  const c = svgStyleVars(recipe);
  const hoodie = recipe.outfit === "o2";

  return `
  <g id="outfitBust">
    <!-- main torso (tapered) -->
    <path d="M88 226
      C112 202 136 194 160 194
      C184 194 208 202 232 226
      C248 244 256 268 256 298
      C256 332 234 356 196 360
      L124 360
      C86 356 64 332 64 298
      C64 268 72 244 88 226 Z"
      fill="${c.outfit}" stroke="${c.outline}" stroke-width="4"/>

    <!-- sleeve edges -->
    <path d="M86 240 C72 258 68 280 70 300" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="7" stroke-linecap="round"/>
    <path d="M234 240 C248 258 252 280 250 300" fill="none" stroke="rgba(255,255,255,0.12)" stroke-width="7" stroke-linecap="round"/>

    ${
      hoodie
        ? `
      <!-- hood -->
      <path d="M122 222 C122 198 140 180 160 180 C180 180 198 198 198 222
               C186 214 176 212 160 212 C144 212 134 214 122 222 Z"
        fill="${c.outfit}" stroke="${c.outline}" stroke-width="4"/>
      <!-- hoodie pocket hint -->
      <path d="M128 308 C140 330 180 330 192 308"
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
    <rect x="118" y="124" width="44" height="28" rx="12"
      fill="rgba(255,255,255,0.12)" stroke="${c.outline}" stroke-width="4"/>
    <rect x="158" y="124" width="44" height="28" rx="12"
      fill="rgba(255,255,255,0.12)" stroke="${c.outline}" stroke-width="4"/>
    <path d="M162 138 L162 138" stroke="${c.outline}" stroke-width="6" stroke-linecap="round"/>
  </g>
  `;
}
