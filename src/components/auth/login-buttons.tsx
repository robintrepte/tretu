"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

type Provider = "tretu" | "discord";

function DiscordIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden>
      <path d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83 97.68 97.68 0 0 0-29.09 0A72.37 72.37 0 0 0 45.64 0 105.89 105.89 0 0 0 19.39 8.09C2.79 32.65-1.71 56.6.54 80.21h0a105.73 105.73 0 0 0 32.17 16.15 77.7 77.7 0 0 0 6.89-11.22 68.42 68.42 0 0 1-10.85-5.18c.91-.66 1.8-1.34 2.66-2.06a75.57 75.57 0 0 0 64.32 0c.87.72 1.76 1.4 2.67 2.06a68.68 68.68 0 0 1-10.87 5.19 77 77 0 0 0 6.89 11.21 105.25 105.25 0 0 0 32.19-16.14c2.64-27.38-4.5-51.11-18.91-72.15ZM42.45 65.69c-6.28 0-11.44-5.76-11.44-12.85S36.06 40 42.45 40c6.43 0 11.54 5.81 11.43 12.85 0 7.09-5.1 12.84-11.43 12.84Zm42.24 0c-6.28 0-11.43-5.76-11.43-12.85S78.31 40 84.69 40c6.43 0 11.54 5.81 11.43 12.85 0 7.09-5.1 12.84-11.43 12.84Z" />
    </svg>
  );
}

/**
 * Sign-in buttons. With a configured Tretu-Konto, "Mit Tretu-Konto anmelden" is the primary action and
 * Discord a secondary fallback; otherwise Discord is the only (primary) button.
 */
export function LoginButtons({
  callbackUrl,
  tretu,
  discord,
}: {
  callbackUrl: string;
  tretu: boolean;
  discord: boolean;
}) {
  const t = useTranslations("login");
  const [pending, setPending] = useState<Provider | null>(null);
  const [failed, setFailed] = useState(false);

  const signIn = async (provider: Provider) => {
    setPending(provider);
    setFailed(false);
    const errorCallbackURL = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    const res = await authClient.signIn
      .social({ provider, callbackURL: callbackUrl, errorCallbackURL })
      .catch(() => null);
    // On success the browser is already on its way to the provider.
    if (!res || res.error) {
      setFailed(true);
      setPending(null);
    }
  };

  return (
    <div className="space-y-3">
      {tretu ? (
        <Button
          onClick={() => void signIn("tretu")}
          disabled={pending !== null}
          className="h-14 w-full text-base font-semibold bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)] focus-visible:ring-[var(--tretu-accent)]/40"
        >
          {pending === "tretu" ? t("redirecting") : t("withTretu")}
        </Button>
      ) : null}
      {discord ? (
        <Button
          onClick={() => void signIn("discord")}
          disabled={pending !== null}
          variant={tretu ? "outline" : "default"}
          className={
            tretu
              ? "h-11 w-full text-sm font-medium"
              : "h-14 w-full text-base font-semibold bg-[#5865F2] text-white hover:bg-[#4d59dc] focus-visible:ring-[#5865F2]/40"
          }
        >
          <span className="flex items-center justify-center gap-2">
            <DiscordIcon />
            {pending === "discord" ? t("redirecting") : tretu ? t("withDiscordFallback") : t("withDiscord")}
          </span>
        </Button>
      ) : null}
      {failed ? (
        <p className="text-center text-sm text-destructive" role="alert">
          {t("startFailed")}
        </p>
      ) : null}
    </div>
  );
}
