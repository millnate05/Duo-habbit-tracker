export const head01 = `
<g id="head01">
  <defs>
    <!-- Full head silhouette (for general clipping) -->
    <clipPath id="clip-head01">
      <path d="
        M256 76
        C206 76 172 108 162 152
        C148 214 160 282 182 318
        C198 344 220 362 256 366
        C292 362 314 344 330 318
        C352 282 364 214 350 152
        C340 108 306 76 256 76
        Z
      "/>
    </clipPath>

    <!-- Scalp region (hair only) - keeps hair off face/jaw -->
    <clipPath id="clip-scalp01">
      <path d="
        M256 78
        C210 78 178 108 170 148
        C162 186 170 222 186 248
        C204 276 228 292 256 292
        C284 292 308 276 326 248
        C342 222 350 186 342 148
        C334 108 302 78 256 78
        Z
      "/>
    </clipPath>
  </defs>

  <!-- HEAD BASE (skull + jaw) -->
  <path class="ol" fill="var(--skin)" d="
    M256 76
    C206 76 172 108 162 152
    C148 214 160 282 182 318
    C198 344 220 362 256 366
    C292 362 314 344 330 318
    C352 282 364 214 350 152
    C340 108 306 76 256 76
    Z
  "/>

  <!-- JAW PLANE (adds a real jawline / cheek structure) -->
  <path fill="rgba(0,0,0,0.08)" d="
    M186 258
    C194 304 218 340 256 344
    C294 340 318 304 326 258
    C314 288 292 316 256 320
    C220 316 198 288 186 258
    Z
  "/>

  <!-- CHEEK / TEMPLE SHADING (subtle, makes face not flat) -->
  <path fill="rgba(0,0,0,0.05)" d="
    M192 176
    C180 214 184 254 202 286
    C210 300 222 310 236 314
    C214 296 206 254 210 210
    C214 180 224 156 244 140
    C220 144 204 156 192 176
    Z
  "/>
  <path fill="rgba(0,0,0,0.05)" d="
    M320 176
    C332 214 328 254 310 286
    C302 300 290 310 276 314
    C298 296 306 254 302 210
    C298 180 288 156 268 140
    C292 144 308 156 320 176
    Z
  "/>

  <!-- EARS (higher + more natural) -->
  <path class="ol" fill="var(--skin)" d="
    M158 204
    C138 210 128 236 132 262
    C138 292 162 302 176 292
    C188 284 188 262 182 244
    C176 224 168 201 158 204
    Z
  "/>
  <path class="ol" fill="var(--skin)" d="
    M354 204
    C374 210 384 236 380 262
    C374 292 350 302 336 292
    C324 284 324 262 330 244
    C336 224 344 201 354 204
    Z
  "/>

  <!-- UNDER-CHIN SEPARATION (this is the “not a blob” line) -->
  <path class="ol noFill" stroke="var(--shadow)" d="M206 336 C224 360 288 360 306 336" />

  <!-- NECK (slightly wider + real connection) -->
  <path class="ol" fill="var(--skin)" d="
    M216 366
    C216 396 296 396 296 366
    L296 334
    C296 316 216 316 216 334
    Z
  "/>

  <!-- NECK SHADOW / COLLAR SEPARATION -->
  <path fill="rgba(0,0,0,0.10)" d="
    M220 360
    C232 374 280 374 292 360
    C284 388 228 388 220 360
    Z
  "/>
</g>
`;
