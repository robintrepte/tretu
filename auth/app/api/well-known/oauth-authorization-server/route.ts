import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { auth } from "@/lib/auth"

/** Served at `${issuer}/.well-known/oauth-authorization-server` (rewrite in next.config.ts). */
const handler = oauthProviderAuthServerMetadata(auth, { headers: { "access-control-allow-origin": "*" } })

export const GET = handler
