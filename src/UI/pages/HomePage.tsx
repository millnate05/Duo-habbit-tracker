import { UI } from "@/ui/theme/tokens";
import { APP_NAME } from "@/engine/constants";

export default function HomePage() {
  return (
    <main
      className="flex min-h-screen items-center justify-center"
      style={{ background: UI.bg, color: UI.text }}
    >
      <div className="text-center px-6">
        <div className="text-sm font-extrabold tracking-widest" style={{ color: UI.accent }}>
          {APP_NAME}
        </div>

        <h1 className="mt-4 text-4xl font-black md:text-6xl">
          you can do it
        </h1>

        <p className="mt-6 text-base font-semibold" style={{ color: UI.muted }}>
          Two people. One shared system.
        </p>
      </div>
    </main>
  );
}
