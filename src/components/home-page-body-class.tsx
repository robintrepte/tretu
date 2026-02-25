"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const HOME_CLASS = "home-page";

export function HomePageBodyClass() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    if (isHome) {
      document.body.classList.add(HOME_CLASS);
    } else {
      document.body.classList.remove(HOME_CLASS);
    }
    return () => document.body.classList.remove(HOME_CLASS);
  }, [isHome]);

  return null;
}
