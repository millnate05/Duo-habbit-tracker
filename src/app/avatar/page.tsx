export default function AvatarPage() {
  return (
    <main style={{ padding: 24 }}>
      <section
        style={{
          border: "1px solid var(--border)",
          borderRadius: 16,
          padding: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "80vh",
          background: "var(--bg)",
        }}
      >
        <img
          src="/avatar/avatar.svg"
          alt="Avatar"
          style={{
            width: "100%",
            height: "auto",
            maxHeight: "80vh",
            objectFit: "contain",
            display: "block",
          }}
        />
      </section>
    </main>
  );
}
