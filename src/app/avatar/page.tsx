export default function AvatarPage() {
  return (
    <main
      style={{
        minHeight: "calc(100vh - 64px)",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 24,
        padding: 24,
        boxSizing: "border-box",
      }}
    >
      {/* LEFT SIDE — AVATAR */}
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 16,
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <FullBodyAvatar />
      </section>

      {/* RIGHT SIDE — PLACEHOLDER */}
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <h1 style={{ marginTop: 0 }}>Avatar</h1>
        <p>
          This is a from-scratch, math-driven SVG avatar.  
          No legacy avatar code is used.
        </p>
      </section>

      <style>{`
        @media (max-width: 900px) {
          main {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}

/* =========================
   FULL BODY AVATAR
   Pure SVG + math
========================= */

function FullBodyAvatar() {
  /* =========================
     GLOBAL CANVAS
  ========================= */
  const W = 512;
  const H = 900;
  const cx = W / 2;

  /* =========================
     HEAD (SVG-derived ratios)
  ========================= */
  const headWidth = 0.17 * W;          // ≈ 87
  const headHeight = 0.21 * H;         // ≈ 189
  const hy = 0.18 * H;                 // ≈ 162
  const jawWidth = 0.72 * headWidth;
  const chinY = hy + 0.48 * headHeight;

  /* =========================
     EYES
  ========================= */
  const eyeY = hy - 0.12 * headHeight;
  const eyeOffset = 0.19 * headWidth;
  const eyeW = 0.28 * headWidth;
  const eyeH = 0.11 * eyeW;
  const pupilOffsetX = 0.18 * eyeW;
  const pupilOffsetY = -0.08 * eyeH;
  const pupilR = eyeH * 0.45;

  /* =========================
     NOSE
  ========================= */
  const noseY = hy + 0.10 * headHeight;
  const noseBridgeW = 0.06 * headWidth;
  const noseTipR = 0.04 * headWidth;

  /* =========================
     EARS
  ========================= */
  const earCxOffset = 0.52 * headWidth;
  const earCy = hy + 0.05 * headHeight;
  const earH = 0.32 * headHeight;
  const earW = 0.18 * headWidth;

  /* =========================
     TORSO
  ========================= */
  const torsoTop = hy + 0.55 * headHeight;
  const shoulderW = 0.42 * W;
  const waistW = 0.78 * shoulderW;
  const torsoH = 0.27 * H;

  /* =========================
     ARMS
  ========================= */
  const armY = torsoTop + 0.08 * torsoH;
  const upperArmW = 0.14 * shoulderW;
  const upperArmL = 0.45 * torsoH;

  /* =========================
     LEGS
  ========================= */
  const legTop = torsoTop + torsoH;
  const thighW = 0.18 * shoulderW;
  const calfW = 0.62 * thighW;
  const legGap = 0.14 * shoulderW;
  const legL = 0.38 * H;

  /* =========================
     SHOES
  ========================= */
  const shoeW = 1.35 * thighW;
  const shoeH = 0.045 * H;

  /* =========================
     COLORS
  ========================= */
  const skin = "#C8A07A";
  const outline = "#1a1a1a";
  const hair = "#241812";
  const shirt = "#ffffff";
  const vest = "#8C1D18";
  const pants = "#1E2A3A";
  const shoes = "#6B4A2D";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ maxHeight: "80vh" }}>
      {/* EARS */}
      <ellipse
        cx={cx - earCxOffset}
        cy={earCy}
        rx={earW}
        ry={earH / 2}
        fill={skin}
        stroke={outline}
        strokeWidth={3}
      />
      <ellipse
        cx={cx + earCxOffset}
        cy={earCy}
        rx={earW}
        ry={earH / 2}
        fill={skin}
        stroke={outline}
        strokeWidth={3}
      />

      {/* HEAD */}
      <path
        d={`
          M ${cx - headWidth / 2} ${hy}
          C ${cx - headWidth / 2} ${hy - headHeight / 2}
            ${cx + headWidth / 2} ${hy - headHeight / 2}
            ${cx + headWidth / 2} ${hy}
          C ${cx + jawWidth / 2} ${chinY}
            ${cx - jawWidth / 2} ${chinY}
            ${cx - headWidth / 2} ${hy}
          Z
        `}
        fill={skin}
        stroke={outline}
        strokeWidth={4}
      />

      {/* HAIR */}
      <path
        d={`
          M ${cx - headWidth / 2} ${hy - headHeight / 2}
          C ${cx} ${hy - headHeight * 0.75}
            ${cx + headWidth / 2} ${hy - headHeight / 2}
            ${cx + headWidth / 2} ${hy - headHeight * 0.2}
          L ${cx - headWidth / 2} ${hy - headHeight * 0.2}
          Z
        `}
        fill={hair}
      />

      {/* EYES */}
      {[-1, 1].map((side) => {
        const ex = cx + side * eyeOffset;
        return (
          <g key={side}>
            <ellipse cx={ex} cy={eyeY} rx={eyeW / 2} ry={eyeH / 2} fill="#fff" />
            <circle
              cx={ex + side * pupilOffsetX}
              cy={eyeY + pupilOffsetY}
              r={pupilR}
              fill="#111"
            />
          </g>
        );
      })}

      {/* NOSE */}
      <circle cx={cx} cy={noseY + noseTipR} r={noseTipR} fill="rgba(0,0,0,0.18)" />

      {/* ARMS */}
      <rect
        x={cx - shoulderW / 2 - upperArmW}
        y={armY}
        width={upperArmW}
        height={upperArmL}
        rx={upperArmW / 2}
        fill={skin}
      />
      <rect
        x={cx + shoulderW / 2}
        y={armY}
        width={upperArmW}
        height={upperArmL}
        rx={upperArmW / 2}
        fill={skin}
      />

      {/* TORSO */}
      <path
        d={`
          M ${cx - shoulderW / 2} ${torsoTop}
          L ${cx + shoulderW / 2} ${torsoTop}
          L ${cx + waistW / 2} ${torsoTop + torsoH}
          L ${cx - waistW / 2} ${torsoTop + torsoH}
          Z
        `}
        fill={vest}
        stroke={outline}
        strokeWidth={4}
      />

      {/* SHIRT */}
      <rect
        x={cx - waistW / 2 + 18}
        y={torsoTop + 18}
        width={waistW - 36}
        height={torsoH - 36}
        rx={18}
        fill={shirt}
      />

      {/* LEGS */}
      <rect
        x={cx - legGap / 2 - thighW}
        y={legTop}
        width={thighW}
        height={legL}
        rx={thighW / 2}
        fill={pants}
      />
      <rect
        x={cx + legGap / 2}
        y={legTop}
        width={thighW}
        height={legL}
        rx={thighW / 2}
        fill={pants}
      />

      {/* SHOES */}
      <rect
        x={cx - legGap / 2 - shoeW}
        y={legTop + legL}
        width={shoeW}
        height={shoeH}
        rx={shoeH / 2}
        fill={shoes}
      />
      <rect
        x={cx + legGap / 2}
        y={legTop + legL}
        width={shoeW}
        height={shoeH}
        rx={shoeH / 2}
        fill={shoes}
      />
    </svg>
  );
}

