"use client";

import { useRouter, usePathname } from "next/navigation";

export default function HomeTab() {
  const router = useRouter();
  const pathname = usePathname();

  const goHome = () => {
    if (pathname !== "/") {
      router.push("/");
    }
  };

  return (
    <button
      type="button"
      onClick={goHome}
      className="cursor-pointer select-none"
    >
      Home
    </button>
  );
}

