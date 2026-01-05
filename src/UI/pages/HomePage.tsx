import { theme } from "@/UI/theme";
import cbum from "@/UI/assets/cbum.jpg";

export default function HomePage() {
  const src = (cbum as unknown as { src: string }).src;

  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: 24,
        textAlign: "center",
        gap: 24,
      }}
    >
      {/* TEMP DEBUG: if you still don’t see an image, this line tells us what URL it’s trying */}
      <div style={{ color: theme.accent.primary, fontWeight: 800, fontSize: 12 }}>
        IMG SRC: {src}
      </div>

      <div
        style={{
          width: 320,
          maxWidth: "90vw",
          borderRadius: 12,
          overflow: "hidden",
          border: `1px solid ${theme.accent.primary}`,
        }}
      >
        <img
          src={src}
          alt="Chris Bumstead"
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>

      <h1 style={{ fontSize: 40, fontWeight: 900 }}>
        “pain is privilege”
      </h1>
    </main>
  );
}
