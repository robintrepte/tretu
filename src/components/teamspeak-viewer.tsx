"use client";

import { useTheme } from "next-themes";
import Script from "next/script";
import { useCallback, useEffect, useId, useState } from "react";

import { TSVIEWER_ID } from "@/lib/env";

const TSVIEWER_LOADER = "https://static.tsviewer.com/short_expire/js/ts3viewer_loader.js";
const REFRESH_SEC = 100;

/** TSViewer URL color params: text (general), s=server, i=?, c=channel?, u=user; _h = hover */
function buildTsViewerUrl(theme: "light" | "dark"): string {
  const isDark = theme === "dark";
  const text = isDark ? "b0b0b0" : "757575";
  const textMain = isDark ? "e5e5e5" : "000000";
  const textHover = isDark ? "ffffff" : "000000";
  const base = "https://www.tsviewer.com/ts3viewer.php";
  const params = new URLSearchParams({
    ID: String(TSVIEWER_ID),
    text,
    text_size: "13",
    text_family: "4",
    text_s_color: textMain,
    text_s_weight: "normal",
    text_s_style: "normal",
    text_s_variant: "normal",
    text_s_decoration: "none",
    text_i_color: "",
    text_i_weight: "normal",
    text_i_style: "normal",
    text_i_variant: "normal",
    text_i_decoration: "none",
    text_c_color: "",
    text_c_weight: "normal",
    text_c_style: "normal",
    text_c_variant: "normal",
    text_c_decoration: "none",
    text_u_color: textMain,
    text_u_weight: "normal",
    text_u_style: "normal",
    text_u_variant: "normal",
    text_u_decoration: "none",
    text_s_color_h: textHover,
    text_s_weight_h: "bold",
    text_s_style_h: "normal",
    text_s_variant_h: "normal",
    text_s_decoration_h: "none",
    text_i_color_h: textHover,
    text_i_weight_h: "bold",
    text_i_style_h: "normal",
    text_i_variant_h: "normal",
    text_i_decoration_h: "none",
    text_c_color_h: "",
    text_c_weight_h: "normal",
    text_c_style_h: "normal",
    text_c_variant_h: "normal",
    text_c_decoration_h: "none",
    text_u_color_h: textHover,
    text_u_weight_h: "bold",
    text_u_style_h: "normal",
    text_u_variant_h: "normal",
    text_u_decoration_h: "none",
    flags: "0",
    iconset: "default_colored_2014",
  });
  return `${base}?${params.toString()}`;
}

declare global {
  interface Window {
    ts3v_url_1?: string;
    ts3v_display?: { init: (url: string, id: number, refresh: number) => void };
  }
}

function isTsViewerApiReady(): boolean {
  return typeof window !== "undefined" && Boolean(window.ts3v_display);
}

export function TeamspeakViewer() {
  const { resolvedTheme } = useTheme();
  const mountId = useId();
  const [scriptReady, setScriptReady] = useState(isTsViewerApiReady);

  const theme = resolvedTheme === "dark" ? "dark" : "light";
  const viewerUrl = buildTsViewerUrl(theme);
  const containerId = `ts3viewer_${TSVIEWER_ID}`;

  const initTsViewer = useCallback(() => {
    if (!isTsViewerApiReady()) return;
    const container = document.getElementById(containerId);
    if (!container) return;
    container.replaceChildren();
    window.ts3v_url_1 = viewerUrl;
    window.ts3v_display!.init(viewerUrl, TSVIEWER_ID, REFRESH_SEC);
  }, [viewerUrl, containerId]);

  useEffect(() => {
    if (isTsViewerApiReady()) {
      setScriptReady(true);
      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TSVIEWER_LOADER}"]`);
    if (!existing) return;

    const onReady = () => {
      if (isTsViewerApiReady()) setScriptReady(true);
    };

    existing.addEventListener("load", onReady);
    onReady();

    return () => existing.removeEventListener("load", onReady);
  }, []);

  useEffect(() => {
    if (!scriptReady) return;
    initTsViewer();
  }, [scriptReady, initTsViewer, mountId]);

  useEffect(() => {
    return () => {
      document.getElementById(containerId)?.replaceChildren();
    };
  }, [containerId]);

  return (
    <>
      <div id={containerId} className="min-h-[200px]" />
      {!scriptReady ? (
        <Script
          src={TSVIEWER_LOADER}
          strategy="afterInteractive"
          onLoad={() => setScriptReady(true)}
          onReady={() => {
            if (isTsViewerApiReady()) setScriptReady(true);
          }}
        />
      ) : null}
    </>
  );
}
