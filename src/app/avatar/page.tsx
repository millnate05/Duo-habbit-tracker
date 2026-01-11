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
  const cx = 256;

  // Head
  const headRadius = 60;
  const headY = 120;

  // Facial features
  const eyeY = headY - 12;
  const eyeOffset = 22;
  const eyeR = 5;

  const noseY = headY + 8;
  const noseW = 10;
  const noseH = 14;

  const earOffsetX = headRadius + 6;
  const earR = 14;

  // Torso
  const torsoTop = headY + headRadius + 12;
  const torsoWidth = 140;
  const torsoHeight = 220;

  // Arms
  const armW = 28;
  const armH = 170;
  const armY = torsoTop + 28;

  // Legs
  const legTop = torsoTop + torsoHeight;
  const legHeight = 240;
  const legWidth = 40;
  const legGap = 24;

  // Colors
  const skin = "#C8A07A";
  const outline = "#1a1a1a";
  const shirt = "#ffffff";
  const vest = "#8C1D18";
  const pants = "#1E2A3A";
  const shoes = "#6B4A2D";
  const hair = "#241812";

  return (
    <svg
      viewBox="0 0 512 900"
      width="100%"
      height="100%"
      style={{ maxHeight: "80vh" }}
    >
      {/* EARS */}
      <ellipse
        cx={cx - earOffsetX}
        cy={headY + 6}
        rx={earR}
        ry={earR + 4}
        fill={skin}
        stroke={outline}
        strokeWidth={3}
      />
      <ellipse
        cx={cx + earOffsetX}
        cy={headY + 6}
        rx={earR}
        ry={earR + 4}
        fill={skin}
        stroke={outline}
        strokeWidth={3}
      />

      {/* HEAD */}
      <circle
        cx={cx}
        cy={headY}
        r={headRadius}
        fill={skin}
        stroke={outline}
        strokeWidth={4}
      />

      {/* HAIR */}
      <path
        d={`
          M ${cx - headRadius} ${headY - headRadius}
          C ${cx} ${headY - headRadius * 1.4}
            ${cx + headRadius} ${headY - headRadius}
            ${cx + headRadius} ${headY - headRadius * 0.25}
          L ${cx - headRadius} ${headY - headRadius * 0.25}
          Z
        `}
        fill={hair}
      />

      {/* EYES */}
      <circle cx={cx - eyeOffset} cy={eyeY} r={eyeR} fill="#fff" />
      <circle cx={cx + eyeOffset} cy={eyeY} r={eyeR} fill="#fff" />
      <circle cx={cx - eyeOffset} cy={eyeY} r={2.5} fill="#111" />
      <circle cx={cx + eyeOffset} cy={eyeY} r={2.5} fill="#111" />

      {/* NOSE */}
      <path
        d={`
          M ${cx} ${noseY}
          C ${cx - noseW} ${noseY + noseH}
            ${cx + noseW} ${noseY + noseH}
            ${cx} ${noseY}
        `}
        fill="rgba(0,0,0,0.08)"
      />

      {/* ARMS */}
      <rect
        x={cx - torsoWidth / 2 - armW + 4}
        y={armY}
        width={armW}
        height={armH}
        rx={14}
        fill={skin}
      />
      <rect
        x={cx + torsoWidth / 2 - 4}
        y={armY}
        width={armW}
        height={armH}
        rx={14}
        fill={skin}
      />

      {/* TORSO */}
      <rect
        x={cx - torsoWidth / 2}
        y={torsoTop}
        width={torsoWidth}
        height={torsoHeight}
        rx={24}
        fill={vest}
        stroke={outline}
        strokeWidth={4}
      />

      {/* SHIRT */}
      <rect
        x={cx - torsoWidth / 2 + 16}
        y={torsoTop + 16}
        width={torsoWidth - 32}
        height={torsoHeight - 32}
        rx={18}
        fill={shirt}
      />

      {/* LEGS */}
      <rect
        x={cx - legGap / 2 - legWidth}
        y={legTop}
        width={legWidth}
        height={legHeight}
        rx={14}
        fill={pants}
      />
      <rect
        x={cx + legGap / 2}
        y={legTop}
        width={legWidth}
        height={legHeight}
        rx={14}
        fill={pants}
      />

      {/* SHOES */}
      <rect
        x={cx - legGap / 2 - legWidth - 6}
        y={legTop + legHeight}
        width={legWidth + 18}
        height={26}
        rx={12}
        fill={shoes}
      />
      <rect
        x={cx + legGap / 2}
        y={legTop + legHeight}
        width={legWidth + 18}
        height={26}
        rx={12}
        fill={shoes}
      />
    </svg>
  );
}
