"use client"

import { oauthProviderClient } from "@better-auth/oauth-provider/client"
import { passkeyClient } from "@better-auth/passkey/client"
import { inferAdditionalFields, magicLinkClient, twoFactorClient, usernameClient } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import type { auth } from "@/lib/auth"

export const authClient = createAuthClient({
  basePath: "/api/auth",
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
