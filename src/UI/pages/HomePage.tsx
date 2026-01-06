// FORCE NEW COMMIT: 2026-01-05-1535

import { theme } from "@/UI/theme";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        gap: 32,
        textAlign: "center",
      }}
    >
      <img
        src="/chris-bumstead-3.jpg.webp"
        alt="Chris Bumstead"
        style={{
          width: "clamp(220px, 60vw, 520px)", // responsive: phone → desktop
          height: "auto",
          maxWidth: "90vw",
          borderRadius: 12,
          border: `1px solid ${theme.accent.primary}`,
        }}
      />

      <h1
        style={{
          fontSize: "clamp(28px, 6vw, 40px)", // responsive text too
          fontWeight: 900,
        }}
      >
        “pain is privilege”
      </h1>
    </main>
  );
}
