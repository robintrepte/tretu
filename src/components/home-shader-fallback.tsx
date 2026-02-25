"use client";

import { usePathname } from "next/navigation";

/**
 * Solid orange background shown only on the homepage, behind the shader.
 * When the shader loads slowly (e.g. on older devices), users see this instead of a blank or white background.
 */
export function HomeShaderFallback() {
  const pathname = usePathname();
  if (pathname !== "/") return null;

  return (
    <div
      className="fixed inset-0 -z-[20] pointer-events-none bg-[var(--tretu-accent)]"
      aria-hidden
    />
  );
}
