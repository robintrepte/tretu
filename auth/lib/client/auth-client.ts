"use client"

import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { passkeyClient } from "@better-auth/passkey/client"
import { inferAdditionalFields, magicLinkClient, twoFactorClient, usernameClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import type { auth } from "@/lib/auth"

/**
 * Passkey challenges live in a cookie that each `generate-authenticate-options` response replaces. The login page
 * starts a passkey autofill request on load; if "Mit Passkey anmelden" is clicked while that request is still in
 * flight, its late response would overwrite the button's challenge. The button therefore waits for pending option
 * requests first (at most 3 s).
 */
const OPTIONS_PATH = "/passkey/generate-authenticate-options"
let optionsInFlight = 0
const optionsWaiters: (() => void)[] = []
const isOptions = (url: URL | string) => String(url).includes(OPTIONS_PATH)
function optionsDone() {
  optionsInFlight = Math.max(0, optionsInFlight - 1)
  if (optionsInFlight === 0) for (const resolve of optionsWaiters.splice(0)) resolve()
}

export function passkeyOptionsSettled(timeoutMs = 3000): Promise<void> {
  if (optionsInFlight === 0) return Promise.resolve()
  return Promise.race([new Promise<void>((resolve) => optionsWaiters.push(resolve)), new Promise<void>((resolve) => setTimeout(resolve, timeoutMs))])
}

export const authClient = createAuthClient({
  basePath: "/api/auth",
  fetchOptions: {
    onRequest: (context) => {
      if (isOptions(context.url)) optionsInFlight++
    },
    onResponse: (context) => {
      if (isOptions(context.request.url)) optionsDone()
    },
  },
  plugins: [
    inferAdditionalFields<typeof auth>(),
    oauthProviderClient(),
    passkeyClient(),
    usernameClient(),
    magicLinkClient(),
    twoFactorClient({
      // Keep the (signed) OAuth request in the address so the app flow continues after the code.
      onTwoFactorRedirect: () => {
        window.location.href = `/2fa${window.location.search}`
      },
    }),
  ],
})
