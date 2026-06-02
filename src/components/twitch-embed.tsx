"use client";

import { useEffect, useState } from "react";

import { TWITCH_CHANNEL } from "@/lib/env";

const EMBED_HEIGHT = 800;

export function TwitchEmbed() {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const parent = window.location.hostname || "tretu.de";
    const referrer = window.location.origin + "/live/";
    setSrc(
      `https://embed.twitch.tv?channel=${TWITCH_CHANNEL}&height=${EMBED_HEIGHT}&parent=${encodeURIComponent(parent)}&referrer=${encodeURIComponent(referrer)}&width=100%25`
    );
  }, []);

  if (!src) {
    return (
      <div id="twitch-embed" className="w-full min-h-[400px] animate-pulse bg-muted/30 rounded-lg" />
    );
  }

  return (
    <div id="twitch-embed" className="w-full">
      <iframe
        src={src}
        allowFullScreen
        scrolling="no"
        frameBorder={0}
        allow="autoplay; fullscreen"
        title="Twitch"
        sandbox="allow-modals allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-storage-access-by-user-activation"
        width="100%"
        height={EMBED_HEIGHT}
        className="min-h-[400px] w-full"
        loading="lazy"
      />
    </div>
  );
}
