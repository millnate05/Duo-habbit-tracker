// src/engine/avatar/avatar.ts
// Single-file avatar engine (v0): smooth face silhouette only

export type AvatarRecipe = {
  skinTone: "olive";
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: {
    olive: "#C8A07A", // olive complexion baseline
  } as const,
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--skin": PALETTE.skin[recipe.skinTone],
  };
}

export function renderAvatarSvg(_recipe: AvatarRecipe, size = 512): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet">
  <style>
    .ol { stroke: var(--outline); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  </style>

  <g id="base-head">
    <path class="ol" fill="var(--skin)" d="
      M256 84
      C214 84 182 108 170 144
      C156 188 160 244 174 288
      C188 332 218 364 256 372
      C294 364 324 332 338 288
      C352 244 356 188 342 144
      C330 108 298 84 256 84
      Z
    "/>
  </g>
</svg>
`.trim();
}
