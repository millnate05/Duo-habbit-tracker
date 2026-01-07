import type { AvatarRecipe } from "./types";
import { recipeToCssVars } from "./palette";
import { PARTS, VIEWBOX_BUST } from "./parts";

function cssVarsToStyleText(vars: Record<string, string>) {
  return Object.entries(vars)
    .map(([k, v]) => `${k}:${v};`)
    .join("");
}

export function renderAvatarSvg(recipe: AvatarRecipe) {
  const vars = recipeToCssVars(recipe);
  const style = cssVarsToStyleText(vars);

  const head = PARTS.heads[recipe.head];

  const hairBack = PARTS.hair[recipe.hair].back;
  const hairFront = PARTS.hair[recipe.hair].front;

  const brows = PARTS.face[recipe.brows];
  const eyes = PARTS.face[recipe.eyes];
  const nose = PARTS.face[recipe.nose];
  const mouth = PARTS.face[recipe.mouth];

  const outfit = PARTS.outfits[recipe.outfitTop];

  const accessory =
    recipe.accessory === "none" ? "" : PARTS.accessories[recipe.accessory];

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX_BUST}" role="img" aria-label="Avatar">
  <style>
    /* shared style rules */
    .ol { stroke: var(--outline); stroke-width: 10; stroke-linecap: round; stroke-linejoin: round; }
    .noFill { fill: none; }
  </style>

  <g style="${style}">
    ${head}

    ${hairBack}

    ${brows}
    ${eyes}
    ${nose}
    ${mouth}

    ${accessory}

    ${hairFront}

    ${outfit}
  </g>
</svg>
  `.trim();
}
