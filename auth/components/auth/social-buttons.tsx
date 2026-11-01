"use client"

import { useTranslations } from "next-intl"
import { useState } from "react"
import { providerIcons, providerNames } from "@/components/provider-icons"
import { Button } from "@/components/ui/button"
import { authClient } from "@/lib/client/auth-client"

export type ProviderId = "discord" | "google" | "apple"

/** "Continue with …" buttons. Inside an app sign-in the signed OAuth request travels along (client plugin). */
export function SocialButtons({ providers, callbackURL }: { providers: ProviderId[]; callbackURL: string }) {
  const t = useTranslations("login")
  const [busy, setBusy] = useState<ProviderId | null>(null)
  if (!providers.length) return null
  return (
    <div className="grid gap-2.5">
      {providers.map((provider) => {
        const Icon = providerIcons[provider]
        return (
          <Button
            key={provider}
            type="button"
            variant="outline"
            size="lg"
            loading={busy === provider}
            disabled={busy !== null}
            onClick={async () => {
              setBusy(provider)
              const { error } = await authClient.signIn.social({
                provider,
                callbackURL,
                errorCallbackURL: `/login${window.location.search}`,
              })
              if (error) setBusy(null)
            }}
          >
            <Icon className={provider === "discord" ? "size-5 text-[#5865F2]" : "size-5"} />
            {t("provider", { provider: providerNames[provider] })}
          </Button>
        )
      })}
    </div>
  )
}
