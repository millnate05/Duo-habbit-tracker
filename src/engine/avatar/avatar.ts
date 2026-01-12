// src/engine/avatar/avatar.ts
// Avatar Engine (placeholder)
// IMPORTANT: NO JSX in this file. Ever.

export type AvatarRecipe = {
  placeholder: true;
};
  
export const DEFAULT_AVATAR: AvatarRecipe = {
  placeholder: true,
};

/**
 * Legacy compatibility shim.
 * Some old UI files may still import this.
 * We intentionally return an empty object for now.
 */
export function cssVars(_recipe: AvatarRecipe): Record<string, string> {
  return {};
}

/**
 * Legacy compatibility shim.
 * Returns an empty SVG string so callers don't crash.
 */
export function renderAvatarSvg(
  _recipe?: AvatarRecipe,
  _size?: number
): string {
  return "";
}
