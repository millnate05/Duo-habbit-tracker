import type { AvatarRecipe } from "./types";
import {
  viewBoxBust,
  headPathD,
  layerBodyBust,
  layerHairBack,
  layerHairFront,
  layerFaceDeluxe,
  layerAccessory,
  layerOutfitBust,
} from "./parts";

export function renderAvatarSvg(recipe: AvatarRecipe) {
  return `
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxBust}" role="img" aria-label="Avatar">
    <defs>
      <clipPath id="headClip">
        <path d="${headPathD}" />
      </clipPath>
    </defs>

    <g stroke-linecap="round" stroke-linejoin="round">
      ${layerBodyBust(recipe)}
      ${layerHairBack(recipe)}
      ${layerFaceDeluxe(recipe)}
      ${layerAccessory(recipe)}
      ${layerHairFront(recipe)}
      ${layerOutfitBust(recipe)}
    </g>
  </svg>
  `.trim();
}
