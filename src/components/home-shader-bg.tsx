"use client";

import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Shader, ChromaFlow, Swirl } from "shaders/react";

const PORTAL_ID = "home-shader-portal";

/** Tretu brand orange – slightly brighter/saturated for more vibrancy */
const ORANGE_MAIN = "#ed6f1a";
const ORANGE_LIGHT = "#ff9040";
const ORANGE_DARK = "#d65a0a";

function ShaderContent() {
  return (
    <div className="fixed inset-0 -z-10 pointer-events-none" style={{ contain: "strict" }}>
      <Shader className="h-full w-full">
        <Swirl
          colorA={ORANGE_DARK}
          colorB={ORANGE_LIGHT}
          speed={0.9}
          detail={0.95}
          blend={50}
        />
        <ChromaFlow
          baseColor={ORANGE_MAIN}
          upColor={ORANGE_LIGHT}
          downColor={ORANGE_MAIN}
          leftColor={ORANGE_DARK}
          rightColor={ORANGE_LIGHT}
          intensity={1.1}
          radius={2}
          momentum={28}
        />
      </Shader>
      <div className="absolute inset-0 bg-black/5" aria-hidden />
    </div>
  );
}

export function HomeShaderBg() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const isHome = pathname === "/";
  if (!mounted || !isHome) return null;

  const portalTarget = typeof document !== "undefined" ? document.getElementById(PORTAL_ID) : null;
  if (!portalTarget) return null;

  return createPortal(<ShaderContent />, portalTarget);
}
