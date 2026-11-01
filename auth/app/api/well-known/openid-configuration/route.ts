import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider"
import { auth } from "@/lib/auth"

/** Served at `${issuer}/.well-known/openid-configuration` (rewrite in next.config.ts). */
const handler = oauthProviderOpenIdConfigMetadata(auth, { headers: { "access-control-allow-origin": "*" } })

export const GET = handler
