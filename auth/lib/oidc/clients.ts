import { createHash, randomUUID } from "node:crypto"
import { eq, inArray, not } from "drizzle-orm"
import { z } from "zod"
import type { Db } from "@/lib/db"
import { oauthClient } from "@/lib/db/schema"
import { TRETU_SCOPES } from "@/lib/oidc/claims"

/**
 * OIDC clients are configuration, not data: TRETU_OAUTH_CLIENTS_JSON lists them and `npm run clients:sync`
 * (also run at boot) writes them into the oauth_client table. Clients removed from the env are disabled.
 */

const uri = z.string().refine((value) => {
  try {
    const url = new URL(value)
    return (url.protocol === "https:" || url.protocol === "http:") && !url.hash && !url.username && !url.password
  } catch {
    return false
  }
}, "must be an absolute http(s) URL without fragment or credentials")

const clientSchema = z
  .object({
    type: z.enum(["confidential", "public"]),
    secret: z.string().min(16).optional(),
    name: z.string().min(1).optional(),
    redirectUris: z.array(uri).min(1),
    postLogoutRedirectUris: z.array(uri).optional(),
    /** First-party clients skip the consent screen. Every Tretu app is first-party. */
    firstParty: z.boolean().default(true),
    homepage: uri.optional(),
  })
  .superRefine((client, ctx) => {
    if (client.type === "confidential" && !client.secret) ctx.addIssue({ code: "custom", message: "confidential clients need a secret" })
    if (client.type === "public" && client.secret) ctx.addIssue({ code: "custom", message: "public clients must not have a secret" })
    for (const value of client.redirectUris) {
      const url = new URL(value)
      const loopback = url.hostname === "127.0.0.1" || url.hostname === "[::1]" || url.hostname === "localhost"
      if (url.protocol === "http:" && !loopback) ctx.addIssue({ code: "custom", message: `http redirect URIs are only allowed on loopback hosts: ${value}` })
    }
  })

const clientsSchema = z.record(z.string().regex(/^[a-z0-9][a-z0-9_-]{1,63}$/, "client ids are lowercase, e.g. saga"), clientSchema)

export type ClientConfig = z.infer<typeof clientSchema> & { clientId: string }

export function parseClientsJson(json: string | undefined): ClientConfig[] {
  if (!json) return []
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    throw new Error("TRETU_OAUTH_CLIENTS_JSON is not valid JSON")
  }
  const parsed = clientsSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`TRETU_OAUTH_CLIENTS_JSON is invalid: ${z.prettifyError(parsed.error)}`)
  return Object.entries(parsed.data).map(([clientId, client]) => ({ clientId, ...client }))
}

/** The oauth-provider plugin's default "hashed" secret storage: base64url(SHA-256(secret)) without padding. */
export function hashClientSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("base64url")
}

/** Where users may land after RP-initiated logout: the configured list, else each redirect URI's origin root. */
export function postLogoutUris(client: ClientConfig): string[] {
  if (client.postLogoutRedirectUris?.length) return client.postLogoutRedirectUris
  return [...new Set(client.redirectUris.map((value) => `${new URL(value).origin}/`))]
}

export function toClientRow(client: ClientConfig, now = new Date()) {
  const isPublic = client.type === "public"
  return {
    clientId: client.clientId,
    clientSecret: client.secret ? hashClientSecret(client.secret) : null,
    name: client.name ?? client.clientId,
    uri: client.homepage ?? null,
    disabled: false,
    skipConsent: client.firstParty,
    enableEndSession: true,
    scopes: [...TRETU_SCOPES],
    redirectUris: client.redirectUris,
    postLogoutRedirectUris: postLogoutUris(client),
    // Confidential clients may authenticate with Basic or POST: app/api/auth normalizes POST to Basic.
    tokenEndpointAuthMethod: isPublic ? "none" : "client_secret_basic",
    applicationType: isPublic && client.redirectUris.some((u) => new URL(u).protocol === "http:") ? "native" : "web",
    grantTypes: ["authorization_code", "refresh_token"],
    responseTypes: ["code"],
    requirePKCE: true,
    metadata: { managedBy: "TRETU_OAUTH_CLIENTS_JSON" },
    updatedAt: now,
  }
}

export interface SyncResult {
  created: string[]
  updated: string[]
  disabled: string[]
}

export async function syncClients(db: Db, clients: ClientConfig[]): Promise<SyncResult> {
  const result: SyncResult = { created: [], updated: [], disabled: [] }
  const now = new Date()
  await db.transaction(async (tx) => {
    for (const client of clients) {
      const row = toClientRow(client, now)
      const existing = await tx.query.oauthClient.findFirst({ where: eq(oauthClient.clientId, client.clientId), columns: { id: true } })
      if (existing) {
        await tx.update(oauthClient).set(row).where(eq(oauthClient.id, existing.id))
        result.updated.push(client.clientId)
      } else {
        await tx.insert(oauthClient).values({ id: randomUUID(), createdAt: now, ...row })
        result.created.push(client.clientId)
      }
    }
    const keep = clients.map((c) => c.clientId)
    const stale = await tx
      .select({ clientId: oauthClient.clientId, metadata: oauthClient.metadata, disabled: oauthClient.disabled })
      .from(oauthClient)
      .where(keep.length ? not(inArray(oauthClient.clientId, keep)) : undefined)
    const managed = stale.filter((c) => (c.metadata as { managedBy?: string } | null)?.managedBy === "TRETU_OAUTH_CLIENTS_JSON" && !c.disabled)
    if (managed.length) {
      await tx
        .update(oauthClient)
        .set({ disabled: true, updatedAt: now })
        .where(inArray(oauthClient.clientId, managed.map((c) => c.clientId)))
      result.disabled.push(...managed.map((c) => c.clientId))
    }
  })
  return result
}
