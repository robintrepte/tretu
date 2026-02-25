"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const DISCORD_SERVER_ID = "262342293250506752";

export function DiscordWidget() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const theme = mounted && resolvedTheme === "dark" ? "dark" : "light";
  const src = `https://discord.com/widget?id=${DISCORD_SERVER_ID}&theme=${theme}`;

  useEffect(() => setMounted(true), []);

  return (
    <iframe
      src={src}
      width="100%"
      height={1000}
      allowTransparency
      frameBorder={0}
      sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      title="Discord Server Widget"
      className="min-h-[400px] w-full rounded-lg"
      loading="lazy"
    />
  );
}
