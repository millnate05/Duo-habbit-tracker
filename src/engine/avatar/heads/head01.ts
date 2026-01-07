export const head01 = `
<g id="head01">
  <defs>
    <!-- Full head silhouette (useful for masking anything to the head) -->
    <clipPath id="clip-head01">
      <path d="M256 70
        C192 70 150 122 150 198
        C150 292 204 356 256 356
        C308 356 362 292 362 198
        C362 122 320 70 256 70 Z" />
    </clipPath>

    <!-- Scalp region (top of head only) for hair clipping -->
    <!-- This is intentionally a little smaller than full head so hair doesn't cover cheeks/ears -->
    <clipPath id="clip-scalp01">
      <path d="
        M256 72
        C198 72 160 114 160 182
        C160 226 176 260 198 284
        C212 300 232 308 256 308
        C280 308 300 300 314 284
        C336 260 352 226 352 182
        C352 114 314 72 256 72
        Z
      " />
    </clipPath>
  </defs>

  <!-- subtle background ring -->
  <circle cx="256" cy="210" r="210" fill="rgba(255,255,255,0.05)"/>
  <circle cx="256" cy="210" r="150" fill="rgba(255,255,255,0.03)"/>

  <!-- ears -->
  <path class="ol" d="M134 240 C110 248 110 292 134 306 C158 320 170 292 166 272 C162 252 150 234 134 240 Z" fill="var(--skin)"/>
  <path class="ol" d="M378 240 C402 248 402 292 378 306 C354 320 342 292 346 272 C350 252 362 234 378 240 Z" fill="var(--skin)"/>

  <!-- head -->
  <path class="ol" d="M256 70
    C192 70 150 122 150 198
    C150 292 204 356 256 356
    C308 356 362 292 362 198
    C362 122 320 70 256 70 Z" fill="var(--skin)"/>

  <!-- under-chin shadow -->
  <path class="ol noFill" d="M200 330 C220 356 292 356 312 330" stroke="var(--shadow)"/>

  <!-- neck -->
  <path class="ol" d="M214 356
    C214 404 298 404 298 356
    L298 320
    C298 302 214 302 214 320 Z" fill="var(--skin)"/>
</g>
`;
