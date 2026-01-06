import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Duo-Habbit-Tracker",
  description: "Accountability app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <Header />
        <div style={{ paddingTop: 64 }}>{children}</div>
      </body>
    </html>
  );
}

function Header() {
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
      <details style={{ position: "relative" }}>
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
          <MenuItem href="/tasks" label="Tasks" />
          <MenuItem href="/completed" label="Completed" />
          <MenuItem href="/stats" label="Stats" />
          <MenuItem href="/avatar" label="Avatar" />
          <MenuItem href="/profile" label="Profile" />
        </nav>
      </details>



      
      <div style={{ fontWeight: 900, letterSpacing: 0.5 }}>
        Duo-Habbit-Tracker
      </div>

     

      {/* Make summary triangle disappear */}
      <style>{`
        summary::-webkit-details-marker { display: none; }
      `}</style>
    </header>
  );
}

function MenuItem({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
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
