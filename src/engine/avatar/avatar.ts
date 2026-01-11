// src/app/avatar/page.tsx
import Link from "next/link";

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
      {/* LEFT HALF: big avatar */}
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 16,
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {/* Put your file at: /public/avatars/Avatar.svg */}
        <img
          src="/avatars/Avatar.svg"
          alt="Avatar"
          style={{
            width: "100%",
            height: "100%",
            maxHeight: "80vh",
            objectFit: "contain",
            display: "block",
          }}
        />
      </section>

      {/* RIGHT HALF: leave room for future controls */}
      <section
        style={{
          border: "1px solid var(--border)",
          background: "var(--bg)",
          borderRadius: 16,
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <h1 style={{ margin: 0, fontSize: 22, color: "var(--text)" }}>Avatar</h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          This page is now using your SVG avatar. Later we can add customization controls here.
        </p>

        <div style={{ flex: 1 }} />

        <Link
          href="/"
          style={{
            alignSelf: "flex-start",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid var(--border)",
            textDecoration: "none",
            color: "var(--text)",
            background: "transparent",
          }}
        >
          ← Back Home
        </Link>
      </section>

      {/* Mobile: stack */}
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
