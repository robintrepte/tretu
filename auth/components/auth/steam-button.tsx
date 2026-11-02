"use client"

import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { SteamIcon } from "@/components/provider-icons"
import { startSteam } from "@/lib/client/steam"
import { cn } from "@/lib/utils"

/**
 * "Mit Steam anmelden" in the style of Steam's official sign-in buttons: Steam's dark navy, the Steam logo and
 * light text (Valve's brand guidelines ask for their button style rather than a re-coloured one).
 */
export function SteamButton({ callbackURL, disabled, onStart }: { callbackURL: string; disabled?: boolean; onStart?: (busy: boolean) => void }) {
  const t = useTranslations("login")
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true)
        onStart?.(true)
        const { error } = await startSteam({ callbackURL, errorCallbackURL: `/login${window.location.search}` })
        if (error) {
          setBusy(false)
          onStart?.(false)
        }
      }}
      className={cn(
        "inline-flex h-11 w-full items-center justify-center gap-2.5 rounded-lg border border-[#2a475e] px-5 text-base font-medium text-[#c7d5e0]",
        "bg-linear-to-b from-[#1b2838] to-[#171a21] shadow-sm transition-colors hover:from-[#2a475e] hover:to-[#1b2838] hover:text-white",
        "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#66c0f4]/40 disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      {busy ? <Loader2 className="size-5 animate-spin" /> : <SteamIcon className="size-5 text-white" />}
      {t("steam")}
    </button>
  )
}
