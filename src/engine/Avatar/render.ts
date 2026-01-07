import type { AvatarRecipe } from "./types";
import { viewBox, layerBody, layerFace, layerHair, layerOutfit, layerLegsAndShoes, layerAccessory } from "./parts";

export function renderAvatarSvg(recipe: AvatarRecipe) {
  // IMPORTANT: consistent stroke scaling for all sizes.
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="Avatar">
    <g stroke-linecap="round" stroke-linejoin="round">
      ${layerBody(recipe)}
      ${layerHair(recipe)}
      ${layerFace(recipe)}
      ${layerAccessory(recipe)}
      ${layerOutfit(recipe)}
      ${layerLegsAndShoes(recipe)}
    </g>
  </svg>
  `.trim();
}

