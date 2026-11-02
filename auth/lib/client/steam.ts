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
  window.location.assign(data.url)
  return { error: null }
}
