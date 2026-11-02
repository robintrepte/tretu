"use client"

import { authClient } from "@/lib/client/auth-client"

/**
 * Starts "Mit Steam anmelden" (or "connect Steam" with `link`). Inside an app sign-in the client plugin adds the
 * signed request of the current page, so the app flow continues after Steam. Resolves only on failure.
 */
export async function startSteam(options: { callbackURL: string; errorCallbackURL: string; link?: boolean }): Promise<{ error: unknown }> {
  const { data, error } = await authClient.$fetch<{ url: string }>(options.link ? "/steam/link" : "/sign-in/steam", {
    method: "POST",
    body: { callbackURL: options.callbackURL, errorCallbackURL: options.errorCallbackURL },
  })
  if (error || !data?.url) return { error: error ?? new Error("no url") }
  // The answer is `{ url, redirect: true }`, which Better Auth's client redirect plugin already follows. A second
  // navigation here would run the Steam round trip twice with the same one-time state: whichever callback came
  // second was refused ("state_mismatch") and could win the race in the browser.
  return { error: null }
}
