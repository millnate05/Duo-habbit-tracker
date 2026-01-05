import { theme } from "@/UI/theme";

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: theme.layout.fullHeight,
        background: theme.page.background,
        color: theme.page.text,
        ...theme.layout.center,
      }}
    >
      <h1 style={theme.text.heading}>
        you can do it
      </h1>
    </main>
  );
}
