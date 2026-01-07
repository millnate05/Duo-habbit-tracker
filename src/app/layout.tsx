"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "./globals.css";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Duo-Habbit-Tracker</title>
        <meta name="description" content="Accountability app" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>

      <body style={{ margin: 0 }}>
        <Header />
        <div style={{ paddingTop: 64 }}>{children}</div>

        {/* Make summary triangle disappear */}
        <style>{`
          summary::-webkit-details-marker { display: none; }
        `}</style>
      </body>
    </html>
  );
}

function Header() {
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement | null>(null);
  const [open, setOpen] = useState(false);

  // Close menu after navigation (works even if a link is clicked, back/forward, etc.)
  useEffect(() => {
    setOpen(false);
    if (detailsRef.current) detailsRef.current.open = false;
  }, [pathname]);

  function closeMenu() {
    setOpen(false);
    if (detailsRef.current) detailsRef.current.open = false;
  }

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 64,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        background: "var(--bg)",
        color: "var(--text)",
        borderBottom: "1px solid var(--border)",
        zIndex: 50,
      }}
    >
      {/* Hamburger + dropdown */}
      <details
        ref={detailsRef}
        open={open}
        onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
        style={{ position: "relative" }}
      >
        <summary
          aria-label="Open menu"
          style={{
            listStyle: "none",
            cursor: "pointer",
            width: 44,
            height: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 10,
            border: "1px solid var(--border)",
            color: "var(--text)",
            userSelect: "none",
          }}
        >
          ☰
        </summary>

        <nav
          style={{
            position: "absolute",
            left: 0,
            top: 52,
            minWidth: 220,
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
          }}
        >
          <MenuItem href="/" label="Home" onSelect={closeMenu} />
          <MenuItem href="/tasks" label="Tasks" onSelect={closeMenu} />
          <MenuItem href="/completed" label="Completed" onSelect={closeMenu} />
          <MenuItem href="/stats" label="Stats" onSelect={closeMenu} />
          <MenuItem href="/avatar" label="Avatar" onSelect={closeMenu} />
          <MenuItem href="/profile" label="Profile" onSelect={closeMenu} />
        </nav>
      </details>

      <div style={{ fontWeight: 900, letterSpacing: 0.5 }}>
        Duo-Habbit-Tracker
      </div>

      {/* Spacer so title stays centered-ish */}
      <div style={{ width: 44 }} />
    </header>
  );
}

function MenuItem({
  href,
  label,
  onSelect,
}: {
  href: string;
  label: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onSelect}
      style={{
        display: "block",
        padding: "12px 14px",
        textDecoration: "none",
        color: "var(--text)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {label}
    </Link>
  );
}
