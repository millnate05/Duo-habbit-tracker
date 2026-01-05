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
      {/* Chris Bumstead image */}
      <img
        src="https://upload.wikimedia.org/wikipedia/commons/9/9f/Chris_Bumstead_2022_Mr_Olympia.jpg"
        alt="Chris Bumstead"
        style={{
          width: "280px",
          maxWidth: "90%",
          borderRadius: "12px",
          marginBottom: "32px",
          border: `1px solid ${theme.accent.primary}`,
        }}
      />

      {/* Quote */}
      <h1
        style={{
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: "0.5px",
        }}
      >
        “pain is privilege”
      </h1>
    </main>
  );
}
