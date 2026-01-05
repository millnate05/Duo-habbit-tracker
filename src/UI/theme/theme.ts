import { UI } from "./tokens";

export const theme = {
  page: {
    background: UI.bg,
    text: UI.text,
  },

  accent: {
    primary: UI.accent,
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
