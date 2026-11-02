"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";

/** "Mit Tretu-Konto anmelden": the only way to sign in to tretu.de (auth.tretu.de, OIDC). */
export function LoginButtons({ callbackUrl }: { callbackUrl: string }) {
  const t = useTranslations("login");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const signIn = async () => {
    setPending(true);
    setFailed(false);
    const errorCallbackURL = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    const res = await authClient.signIn
      .social({ provider: "tretu", callbackURL: callbackUrl, errorCallbackURL })
      .catch(() => null);
    // On success the browser is already on its way to auth.tretu.de.
    if (!res || res.error) {
      setFailed(true);
      setPending(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        onClick={() => void signIn()}
        disabled={pending}
        className="h-14 w-full text-base font-semibold bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)] focus-visible:ring-[var(--tretu-accent)]/40"
      >
        {pending ? t("redirecting") : t("withTretu")}
      </Button>
      {failed ? (
        <p className="text-center text-sm text-destructive" role="alert">
          {t("startFailed")}
        </p>
      ) : null}
    </div>
  );
}
