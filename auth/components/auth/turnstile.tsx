"use client"

import { useEffect, useRef } from "react"

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: { sitekey: string; callback: (token: string) => void; "expired-callback"?: () => void; language?: string }) => string
      reset: (id?: string) => void
    }
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

/** Cloudflare Turnstile, loaded only on the registration page and only when configured. */
export function Turnstile({ siteKey, onToken, language }: { siteKey: string; onToken: (token: string | null) => void; language: string }) {
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cancelled = false
    const render = () => {
      if (cancelled || !container.current || !window.turnstile) return
      window.turnstile.render(container.current, { sitekey: siteKey, callback: onToken, "expired-callback": () => onToken(null), language })
    }
    if (window.turnstile) render()
    else {
      const script = document.createElement("script")
      script.src = SCRIPT_SRC
      script.async = true
      script.onload = render
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
    }
  }, [siteKey, onToken, language])
  return <div ref={container} className="min-h-[65px]" />
}
