"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { theme } from "@/UI/theme";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const leftRef = useRef<HTMLDivElement | null>(null);
  const rightRef = useRef<HTMLDivElement | null>(null);

  // Close menus on outside click / Escape
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (leftRef.current && !leftRef.current.contains(t)) setLeftOpen(false);
      if (rightRef.current && !rightRef.current.contains(t)) setRightOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setLeftOpen(false);
        setRightOpen(false);
      }
    }
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const shellBg = "#000";
  const shellText = "#fff";

  const buttonBase = (active: boolean): React.CSSProperties => ({
    width: 44,
    height: 44,
    borderRadius: 14, // "less severe pill" feel
    border: "1px solid rgba(255,255,255,0.14)",
    background: active ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
    color: shellText,
    display: "grid",
    placeItems: "center",
    cursor: "pointer",
    userSelect: "none",
    boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
  });

  const menu: React.CSSProperties = {
    position: "absolute",
    top: 52,
    minWidth: 210,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(0,0,0,0.92)",
    boxShadow: "0 18px 48px rgba(0,0,0,0.55)",
    overflow: "hidden",
    padding: 6,
    backdropFilter: "blur(10px)",
  };

  function MenuLink({
    href,
    label,
    icon,
    onClick,
  }: {
    href: string;
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
  }) {
    const [hover, setHover] = useState(false);
    return (
      <Link
        href={href}
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 10px",
          borderRadius: 10,
          textDecoration: "none",
          color: shellText,
          fontWeight: 900,
          background: hover ? "rgba(255,255,255,0.06)" : "transparent",
        }}
      >
        <span style={{ width: 18, display: "inline-grid", placeItems: "center" }}>
          {icon}
        </span>
        <span>{label}</span>
      </Link>
    );
  }

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          padding: 0,
          background: shellBg,
          color: shellText,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji"',
        }}
      >
        {/* Top bar */}
        <header
          style={{
            position: "sticky",
            top: 0,
            zIndex: 100,
            padding: "10px 12px",
            background: "rgba(0,0,0,0.88)",
            borderBottom: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(10px)",
          }}
        >
          <div
            style={{
              maxWidth: 980,
              margin: "0 auto",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            {/* Left: Profile circle */}
            <div ref={leftRef} style={{ position: "relative" }}>
              <div
                style={buttonBase(leftOpen)}
                onClick={() => {
                  setLeftOpen((v) => !v);
                  setRightOpen(false);
                }}
                role="button"
                aria-label="Open profile menu"
                title="Profile menu"
              >
                <div
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.18)",
                    display: "grid",
                    placeItems: "center",
                    fontWeight: 900,
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  {/* Placeholder for now; later swap to avatar image */}
                  👤
                </div>
              </div>

              {leftOpen ? (
                <div style={{ ...menu, left: 0 }}>
                  <MenuLink
                    href="/profile"
                    label="Profile"
                    icon="👤"
                    onClick={() => setLeftOpen(false)}
                  />
                  <MenuLink
                    href="/completed"
                    label="Completed"
                    icon="✅"
                    onClick={() => setLeftOpen(false)}
                  />
                  <MenuLink
                    href="/avatar"
                    label="Avatar"
                    icon="🧩"
                    onClick={() => setLeftOpen(false)}
                  />
                </div>
              ) : null}
            </div>

            {/* Center spacer */}
            <div style={{ flex: 1 }} />

            {/* Right: Plus button */}
            <div ref={rightRef} style={{ position: "relative" }}>
              <div
                style={{
                  ...buttonBase(rightOpen),
                  border: `1px solid ${theme.accent.primary}`,
                }}
                onClick={() => {
                  setRightOpen((v) => !v);
                  setLeftOpen(false);
                }}
                role="button"
                aria-label="Open actions menu"
                title="Actions"
              >
                <span style={{ fontSize: 22, lineHeight: 1, fontWeight: 900 }}>
                  +
                </span>
              </div>

              {rightOpen ? (
                <div style={{ ...menu, right: 0 }}>
                  <MenuLink
                    href="/tasks"
                    label="Tasks"
                    icon="🗒️"
                    onClick={() => setRightOpen(false)}
                  />
                  <MenuLink
                    href="/shared"
                    label="Shared"
                    icon="🤝"
                    onClick={() => setRightOpen(false)}
                  />
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* Page content */}
        <div>{children}</div>
      </body>
    </html>
  );
}
