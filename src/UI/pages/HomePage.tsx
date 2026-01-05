import Image from "next/image";
import { theme } from "@/UI/theme";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        ...theme.layout.center,
        flexDirection: "column",
        padding: "24px",
        textAlign: "center",
      }}
    >
      <div
        style={{
          border: `1px solid ${theme.accent.primary}`,
          borderRadius: 12,
          overflow: "hidden",
          width: 320,
          maxWidth: "90vw",
          marginBottom: 28,
        }}
      >
        <Image
          src="/images/cbum.jpg"
          alt="Chris Bumstead"
          width={320}
          height={400}
          style={{ width: "100%", height: "auto", display: "block" }}
          priority
        />
      </div>

      <h1 style={{ fontSize: 36, fontWeight: 900 }}>
        “pain is privilege”
      </h1>
    </main>
  );
}
