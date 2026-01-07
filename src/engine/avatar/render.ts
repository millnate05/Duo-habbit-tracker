import type { AvatarRecipe } from "./types";
import {
  viewBox,
  headPathD,
  layerBody,
  layerFace,
  layerHair,
  layerAccessory,
  layerOutfit,
  layerLegsAndShoes,
} from "./parts";

export function renderAvatarSvg(recipe: AvatarRecipe) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="Avatar">
    <defs>
      <clipPath id="headClip">
        <path d="${headPathD}" />
      </clipPath>
    </defs>

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
