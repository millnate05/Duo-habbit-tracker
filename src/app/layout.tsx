"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { theme } from "@/UI/theme";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [leftOpen, setLeftOpen] = useState(false);
  const leftRef = useRef<HTMLDivElement | null>(null);

  // Close menus on outside click / Escape
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (leftRef.current && !leftRef.current.contains(t)) setLeftOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setLeftOpen(false);
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
    borderRadius: 14,
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

  // Minimalist Home icon button (icon-only, larger, centered)
  const homeIconButton: React.CSSProperties = {
    width: 54,
    height: 54,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.14)",
    background: "rgba(255,255,255,0.04)",
    color: shellText,
    display: "grid",
    placeItems: "center",
    textDecoration: "none",
    boxShadow: "0 10px 24px rgba(0,0,0,0.35)",
    userSelect: "none",
  };

  const HomeIcon = ({ size = 28 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3.5 10.5L12 3.75L20.5 10.5V20.25C20.5 20.6642 20.1642 21 19.75 21H14.25V15.25C14.25 14.8358 13.9142 14.5 13.5 14.5H10.5C10.0858 14.5 9.75 14.8358 9.75 15.25V21H4.25C3.83579 21 3.5 20.6642 3.5 20.25V10.5Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );

  // SVG Plus icon so it never renders like "+ over -"
  const PlusIcon = ({ size = 22 }: { size?: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );

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
                onClick={() => setLeftOpen((v) => !v)}
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

            {/* Center: Minimal Home icon button */}
            <Link
              href="/"
              onClick={() => setLeftOpen(false)}
              style={homeIconButton}
              aria-label="Go to Home"
              title="Home"
            >
              <HomeIcon size={30} />
            </Link>

            {/* Right: Plus button -> goes straight to /tasks */}
            <Link
              href="/tasks"
              onClick={() => setLeftOpen(false)}
              style={{
                ...buttonBase(false),
                border: `1px solid ${theme.accent.primary}`,
              }}
              aria-label="Go to Tasks"
              title="Tasks"
            >
              <PlusIcon size={24} />
            </Link>
          </div>
        </header>

        {/* Page content with transitions */}
        <div style={{ maxWidth: 980, margin: "0 auto" }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </body>
    </html>
  );
}
