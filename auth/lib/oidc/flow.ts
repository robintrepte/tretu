import "server-only"
import { verifyOAuthQueryParams } from "@better-auth/oauth-provider"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { oauthClient } from "@/lib/db/schema"
import { env } from "@/lib/env"

export type SearchParams = Record<string, string | string[] | undefined>

export function toQueryString(searchParams: SearchParams): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) for (const v of value) params.append(key, v)
    else if (value !== undefined) params.append(key, value)
  }
  return params.toString()
}

export interface OAuthRequestInfo {
  clientId: string
  clientName: string
  /** The signed query is intact and not expired. */
  valid: boolean
  /** The app asked for a fresh sign-in (prompt=login or max_age): an existing session is not enough. */
  forceLogin: boolean
}

/** Reads the signed authorization request the oauth-provider plugin puts on the login/consent pages. */
export async function readOAuthRequest(searchParams: SearchParams): Promise<OAuthRequestInfo | null> {
  const query = toQueryString(searchParams)
  const params = new URLSearchParams(query)
  const clientId = params.get("client_id")
  if (!clientId || !params.get("sig")) return null
  const signed = new URLSearchParams()
  const names = new Set(params.getAll("ba_param"))
  for (const [key, value] of params) if (key === "sig" || key === "ba_param" || names.has(key)) signed.append(key, value)
  const valid = await verifyOAuthQueryParams(signed.toString(), env.BETTER_AUTH_SECRET).catch(() => false)
  const client = await db.query.oauthClient.findFirst({ where: eq(oauthClient.clientId, clientId), columns: { name: true, disabled: true } })
  const prompt = (params.get("prompt") ?? "").split(" ")
  return {
    clientId,
    clientName: client?.name ?? clientId,
    valid: valid && Boolean(client && !client.disabled),
    forceLogin: prompt.includes("login") || prompt.includes("select_account") || params.has("max_age"),
  }
}

export { safeNext } from "@/lib/redirects"
