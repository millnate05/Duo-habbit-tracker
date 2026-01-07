import type { AvatarRecipe } from "./types";

export const PALETTE = {
  outline: "#141414",
  highlight: "rgba(255,255,255,0.22)",
  shadow: "rgba(0,0,0,0.12)",

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

  iris: {
    // you can add this to recipe later; for now we keep it fixed
    i1: "#2F80ED", // blue
    i2: "#27AE60", // green
    i3: "#8E5A2B", // brown
    i4: "#111827", // dark
  },
} as const;

export function recipeToCssVars(recipe: AvatarRecipe) {
  return {
    "--outline": PALETTE.outline,
    "--shadow": PALETTE.shadow,
    "--highlight": PALETTE.highlight,
    "--skin": PALETTE.skin[recipe.skinTone],
    "--hair": PALETTE.hair[recipe.hairColor],
    "--outfit": PALETTE.outfit[recipe.outfitTop],
    "--iris": PALETTE.iris.i3,
  } as const;
}

