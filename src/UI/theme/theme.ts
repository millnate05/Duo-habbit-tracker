// theme.ts
import { UI } from "./tokens";

export const theme = {
  // Page-level look & feel
  page: {
    // richer background while keeping your black/orange identity
    background:
      "radial-gradient(900px 600px at 18% 8%, rgba(245, 158, 11, 0.12) 0%, rgba(245, 158, 11, 0) 55%)," +
      "radial-gradient(700px 500px at 82% 18%, rgba(245, 158, 11, 0.08) 0%, rgba(245, 158, 11, 0) 60%)," +
      "linear-gradient(180deg, rgba(0,0,0,0.96) 0%, rgba(0,0,0,0.92) 40%, rgba(0,0,0,0.96) 100%)",
    text: UI.text,
  },

  accent: {
    primary: UI.accent,
  },

  // Surfaces / borders / depth (for cards, pills, etc.)
  surface: {
    // subtle card fill that still reads as "black"
    cardBg: "rgba(255,255,255,0.03)",
    cardBgHover: "rgba(255,255,255,0.045)",
    // softer border than var(--border) so it looks less “boxy”
    border: "rgba(255,255,255,0.10)",
    borderStrong: "rgba(255,255,255,0.16)",
    shadow: "0 14px 34px rgba(0,0,0,0.45)",
    shadowHover: "0 18px 44px rgba(0,0,0,0.55)",
  },

  // Pills / badges
  pill: {
    bg: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.12)",
    text: UI.text,
    muted: "rgba(255,255,255,0.70)",
  },

  // Progress bars
  progress: {
    track: "rgba(255,255,255,0.06)",
    // keep orange but make it feel premium
    fill:
      "linear-gradient(90deg, rgba(245,158,11,0.95) 0%, rgba(251,191,36,0.90) 100%)",
  },

  // Buttons (still optional to use)
  button: {
    ghostBg: "rgba(255,255,255,0.03)",
    ghostBgHover: "rgba(255,255,255,0.05)",
    border: "rgba(255,255,255,0.14)",
  },

  text: {
    heading: {
      fontSize: 48,
      fontWeight: 900 as const,
      color: UI.text,
    },
    body: {
      fontSize: 16,
      fontWeight: 600 as const,
      color: UI.text,
    },
    muted: {
      color: UI.muted,
    },
  },

  layout: {
    fullHeight: "100vh",
    center: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
  },
};
