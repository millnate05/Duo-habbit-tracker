// src/engine/avatar/avatar.ts
// ENGINE ONLY (NO JSX)

export type AvatarRecipe = {
  skinTone: "olive";
  faceLength: number;
  cheekWidth: number;
  jawWidth: number;
  hair: "none";
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
  faceLength: 1,
  cheekWidth: 1,
  jawWidth: 1,
  hair: "none",
};

const PALETTE = {
  outline: "#1a1a1a",
  skin: { olive: "#C8A07A" } as const,
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--skin": PALETTE.skin[recipe.skinTone],
  };
}

// Keep this so AvatarEditor/Preview can still import it without breaking.
export function renderAvatarSvg(_recipe: AvatarRecipe, size = 512): string {
  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <rect width="512" height="512" fill="transparent"/>
  <circle cx="256" cy="220" r="110" fill="var(--skin)" stroke="var(--outline)" stroke-width="6"/>
  <text x="256" y="420" text-anchor="middle" font-family="system-ui" font-size="18" fill="#666">
    Engine Avatar Placeholder
  </text>
</svg>
`.trim();
}
