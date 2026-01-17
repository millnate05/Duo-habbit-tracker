import { UI } from "./tokens";

export const theme = {
  page: {
    background: "#000000",
    text: UI.text,
  },

  accent: {
    primary: UI.accent,
  },

  surface: {
    cardBg: "rgba(255,255,255,0.04)",
    cardBgHover: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.10)",
    borderStrong: "rgba(255,255,255,0.16)",
    shadow: "0 14px 34px rgba(0,0,0,0.55)",
    shadowHover: "0 18px 44px rgba(0,0,0,0.65)",
  },

  pill: {
    bg: "rgba(255,255,255,0.06)",
    border: "rgba(255,255,255,0.12)",
    text: UI.text,
    muted: "rgba(255,255,255,0.75)",
  },

  progress: {
    track: "rgba(0,0,0,0.22)",
    fill: "rgba(0,0,0,0.55)", // will be overridden per-task for contrast
  },

  button: {
    ghostBg: "rgba(255,255,255,0.06)",
    ghostBgHover: "rgba(255,255,255,0.10)",
    border: "rgba(255,255,255,0.20)",
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
