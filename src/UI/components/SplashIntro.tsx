"use client";

import React, { useEffect, useRef, useState } from "react";
import { theme } from "@/UI/theme";

type SplashIntroProps = {
  imageSrc: string;
  quote: string;
  onDismiss: () => void;
};

export default function SplashIntro({
  imageSrc,
  quote,
  onDismiss,
}: SplashIntroProps) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const [exiting, setExiting] = useState(false);

  function dismiss() {
    if (exiting) return;
    setExiting(true);
    window.setTimeout(() => onDismiss(), 260);
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exiting]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2000,
        background: theme.page.background,
        color: theme.page.text,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        transform: exiting ? "translateX(-110%)" : "translateX(0)",
        transition: "transform 260ms ease",
        touchAction: "pan-y pan-x",
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        startRef.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = startRef.current;
        startRef.current = null;
        if (!start) return;

        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;

        const absX = Math.abs(dx);
        const absY = Math.abs(dy);

        // Swipe left OR swipe up to dismiss
        if (dx < -60 && absX > absY) dismiss();
        else if (dy < -70 && absY > absX) dismiss();
      }}
      onClick={dismiss}
      role="button"
      aria-label="Dismiss intro"
    >
      <div
        style={{
          width: "min(980px, 100%)",
          display: "flex",
          flexDirection: "column",
          gap: 18,
          alignItems: "center",
          textAlign: "center",
        }}
      >
        <img
          src={imageSrc}
          alt="Intro"
          style={{
            width: "min(92vw, 620px)",
            height: "auto",
            borderRadius: 16,
            border: `1px solid ${theme.accent.primary}`,
            boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
          }}
        />

        <div
          style={{
            fontSize: "clamp(26px, 5vw, 44px)",
            fontWeight: 900,
            margin: 0,
            lineHeight: 1.05,
          }}
        >
          {quote}
        </div>

        <div style={{ opacity: 0.75, fontWeight: 800, marginTop: 6 }}>
          Swipe left or up to begin
        </div>
      </div>
    </div>
  );
}
