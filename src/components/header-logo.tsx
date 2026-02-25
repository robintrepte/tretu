"use client";

import Image from "next/image";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function HeaderLogo() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  return (
    <Image
      src={mounted && isDark ? "/logo-white.svg" : "/logo.svg"}
      alt="Tretu"
      width={180}
      height={60}
      className="h-[25px] w-auto"
      priority
    />
  );
}
