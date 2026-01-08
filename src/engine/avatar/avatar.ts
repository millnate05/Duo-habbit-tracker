// src/engine/avatar/avatar.ts
// Single-file avatar engine (v0): base face shape only (no eyes/hair/ears/neck yet)

export type AvatarRecipe = {
  // Keep recipe minimal for now; we can expand later without breaking the UI.
  skinTone: "olive";
};

export const DEFAULT_AVATAR: AvatarRecipe = {
  skinTone: "olive",
};

const PALETTE = {
  outline: "#1a1a1a",
  // subtle global shadow used for plane shading cues
  shadow: "rgba(0,0,0,0.14)",
  // olive complexion baseline
  skin: {
    olive: "#C8A07A",
  } as const,
} as const;

export function cssVars(recipe: AvatarRecipe): Record<string, string> {
  return {
    "--outline": PALETTE.outline,
    "--shadow": PALETTE.shadow,
    "--skin": PALETTE.skin[recipe.skinTone],
  };
}

export function renderAvatarSvg(recipe: AvatarRecipe, size = 512): string {
  // NOTE: This is a “head-only” avatar on purpose.
  // Next steps later: neck/shoulders, ears, face parts, hair, accessories, etc.

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">
  <style>
    .ol { stroke: var(--outline); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; }
    .noFill { fill: none; }
  </style>

  <!-- Base face shape: oval silhouette with cheekbones + jaw definition -->
  <g id="base-head">
    <!-- Face silhouette: oval w/ structured jaw -->
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

    <!-- Cheekbone planes (subtle) -->
    <path fill="rgba(0,0,0,0.060)" d="
      M184 206
      C174 238 176 270 190 298
      C204 326 226 344 248 350
      C220 334 206 300 206 262
      C206 232 216 206 236 190
      C214 192 196 196 184 206
      Z
    "/>
    <path fill="rgba(0,0,0,0.060)" d="
      M328 206
      C338 238 336 270 322 298
      C308 326 286 344 264 350
      C292 334 306 300 306 262
      C306 232 296 206 276 190
      C298 192 316 196 328 206
      Z
    "/>

    <!-- Jaw plane shadow (defines cheek → jaw transition) -->
    <path fill="rgba(0,0,0,0.080)" d="
      M198 272
      C206 312 228 346 256 350
      C284 346 306 312 314 272
      C302 300 284 326 256 330
      C228 326 210 300 198 272
      Z
    "/>

    <!-- Chin highlight (tiny plane cue) -->
    <path fill="rgba(255,255,255,0.085)" d="
      M232 338
      C242 352 270 352 280 338
      C270 346 242 346 232 338
      Z
    "/>

    <!-- Temple highlights (keeps it from feeling flat) -->
    <path fill="rgba(255,255,255,0.050)" d="
      M206 140
      C192 162 188 184 190 204
      C196 186 206 168 220 154
      C232 142 246 134 260 132
      C236 132 218 134 206 140
      Z
    "/>
    <path fill="rgba(255,255,255,0.050)" d="
      M306 140
      C320 162 324 184 322 204
      C316 186 306 168 292 154
      C280 142 266 134 252 132
      C276 132 294 134 306 140
      Z
    "/>

    <!-- Jawline edge cue (subtle contour line) -->
    <path class="ol noFill" stroke="rgba(0,0,0,0.140)" d="
      M200 270
      C208 316 230 350 256 354
      C282 350 304 316 312 270
    "/>
  </g>
</svg>
`.trim();
}

