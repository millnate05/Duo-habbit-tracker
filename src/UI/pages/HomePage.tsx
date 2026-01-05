import Image from "next/image";
import { theme } from "@/UI/theme";
import cbum from "@/UI/assets/cbum.jpg";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        ...theme.layout.center,
        flexDirection: "column",
        padding: 24,
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 320,
          maxWidth: "90vw",
          borderRadius: 12,
          overflow: "hidden",
          border: `1px solid ${theme.accent.primary}`,
          marginBottom: 28,
        }}
      >
        <Image
          src={cbum}
          alt="Chris Bumstead"
          priority
          style={{ width: "100%", height: "auto", display: "block" }}
        />
      </div>

      <h1 style={{ fontSize: 40, fontWeight: 900 }}>
        “pain is privilege”
      </h1>
    </main>
  );
}
