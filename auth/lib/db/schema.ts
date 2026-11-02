import { sql } from "drizzle-orm"
import { boolean, customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core"

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" })

/*
 * Exported names are Better Auth's model names (the Drizzle adapter looks tables up by them);
 * table and column names are snake_case.
 */

const createdAt = timestamp({ withTimezone: true }).notNull().defaultNow()
const updatedAt = timestamp({ withTimezone: true })
  .notNull()
  .defaultNow()
  .$onUpdate(() => new Date())

/* ───────────────────────── Better Auth core ───────────────────────── */

export const user = pgTable(
  "user",
  {
    /** The permanent Tretu ID: the OIDC `sub` every app stores. A UUID. */
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull().unique(),
    emailVerified: boolean().notNull().default(false),
    image: text(),
    /** Lowercase, unique across all of Tretu. */
    username: text().unique(),
    /** The username as the user typed it (case kept). */
    displayUsername: text(),
    twoFactorEnabled: boolean().default(false),
    /** UI language and the `locale` claim. */
    locale: text().$type<"de" | "en">().notNull().default("de"),
    /** Global roles (`roles` claim), e.g. ["admin"]. */
    roles: text().array().notNull().default(sql`'{}'::text[]`),
    /** Set by the legacy import when the old name was taken: the next rename is free and is asked for after login. */
    usernamePending: boolean().notNull().default(false),
    usernameChangedAt: timestamp({ withTimezone: true }),
    lastLoginAt: timestamp({ withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (t) => [index("user_created_idx").on(t.createdAt)],
)

export const session = pgTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    token: text().notNull().unique(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt,
    updatedAt,
  },
  (t) => [index("session_user_idx").on(t.userId)],
)

export const account = pgTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: timestamp({ withTimezone: true }),
    refreshTokenExpiresAt: timestamp({ withTimezone: true }),
    scope: text(),
    /** Native Better Auth scrypt hash, or an imported `bcrypt:`/`multi:` hash (see lib/passwords.ts). */
    password: text(),
    /** Tretu: the name at the provider where it has no profile endpoint of its own (Steam persona name). */
    displayName: text(),
    createdAt,
    updatedAt,
  },
  (t) => [index("account_user_idx").on(t.userId), uniqueIndex("account_provider_account_idx").on(t.providerId, t.accountId)],
)

export const verification = pgTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt,
    updatedAt,
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
)

/* ───────────────────────── Better Auth plugins ───────────────────────── */

/** Signing keys for ID tokens (jwt plugin); private keys are encrypted with BETTER_AUTH_SECRET. */
export const jwks = pgTable("jwks", {
  id: text().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).notNull(),
  expiresAt: timestamp({ withTimezone: true }),
  alg: text(),
  crv: text(),
})

export const passkey = pgTable(
  "passkey",
  {
    id: text().primaryKey(),
    name: text(),
    publicKey: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    credentialID: text("credential_id").notNull(),
    counter: integer().notNull(),
    deviceType: text().notNull(),
    backedUp: boolean().notNull(),
    transports: text(),
    createdAt: timestamp({ withTimezone: true }),
    aaguid: text(),
  },
  (t) => [index("passkey_user_idx").on(t.userId), uniqueIndex("passkey_credential_idx").on(t.credentialID)],
)

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text().primaryKey(),
    secret: text().notNull(),
    backupCodes: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean().default(true),
    failedVerificationCount: integer().default(0),
    lockedUntil: timestamp({ withTimezone: true }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId)],
)

/* ───────────────────────── OAuth 2.1 / OIDC provider ───────────────────────── */

export const oauthClient = pgTable("oauth_client", {
  id: text().primaryKey(),
  clientId: text().notNull().unique(),
  clientSecret: text(),
  clientDiscoveryId: text(),
  disabled: boolean().default(false),
  skipConsent: boolean(),
  enableEndSession: boolean(),
  subjectType: text(),
  scopes: text().array(),
  clientCredentialsScopes: text().array(),
  userId: text().references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }),
  name: text(),
  uri: text(),
  icon: text(),
  contacts: text().array(),
  tos: text(),
  policy: text(),
  softwareId: text(),
  softwareVersion: text(),
  softwareStatement: text(),
  redirectUris: text().array().notNull(),
  postLogoutRedirectUris: text().array(),
  backchannelLogoutUri: text(),
  backchannelLogoutSessionRequired: boolean(),
  tokenEndpointAuthMethod: text(),
  applicationType: text(),
  jwks: text(),
  jwksUri: text(),
  grantTypes: text().array(),
  responseTypes: text().array(),
  requirePKCE: boolean("require_pkce"),
  dpopBoundAccessTokens: boolean().default(false),
  referenceId: text(),
  metadata: jsonb(),
})

export const oauthResource = pgTable("oauth_resource", {
  id: text().primaryKey(),
  identifier: text().notNull().unique(),
  name: text().notNull(),
  accessTokenTtl: integer(),
  refreshTokenTtl: integer(),
  signingAlgorithm: text(),
  signingKeyId: text(),
  allowedScopes: text().array(),
  customClaims: jsonb(),
  dpopBoundAccessTokensRequired: boolean().default(false),
  disabled: boolean().default(false),
  createdAt: timestamp({ withTimezone: true }),
  updatedAt: timestamp({ withTimezone: true }),
  policyVersion: integer().default(1),
  metadata: jsonb(),
})

export const oauthClientResource = pgTable("oauth_client_resource", {
  id: text().primaryKey(),
  clientId: text()
    .notNull()
    .references(() => oauthClient.clientId, { onDelete: "cascade" }),
  resourceId: text()
    .notNull()
    .references(() => oauthResource.identifier, { onDelete: "cascade" }),
  metadata: jsonb(),
  createdAt: timestamp({ withTimezone: true }),
})

export const oauthRefreshToken = pgTable(
  "oauth_refresh_token",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text().references(() => session.id, { onDelete: "set null" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    revoked: timestamp({ withTimezone: true }),
    rotatedAt: timestamp({ withTimezone: true }),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: timestamp({ withTimezone: true }),
    authTime: timestamp({ withTimezone: true }),
    confirmation: jsonb(),
    scopes: text().array().notNull(),
  },
  (t) => [index("oauth_refresh_token_user_idx").on(t.userId)],
)

export const oauthAccessToken = pgTable(
  "oauth_access_token",
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text().references(() => session.id, { onDelete: "set null" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    refreshId: text().references(() => oauthRefreshToken.id, { onDelete: "cascade" }),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    revoked: timestamp({ withTimezone: true }),
    confirmation: jsonb(),
    scopes: text().array().notNull(),
  },
  (t) => [index("oauth_access_token_user_idx").on(t.userId)],
)

export const oauthConsent = pgTable(
  "oauth_consent",
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    referenceId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index("oauth_consent_user_idx").on(t.userId)],
)

/** Replay protection for private_key_jwt client assertions (unused by Tretu clients, required by the plugin). */
export const oauthClientAssertion = pgTable("oauth_client_assertion", {
  id: text().primaryKey(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
})

/* ───────────────────────── Tretu ───────────────────────── */

/**
 * Accounts linked by other Tretu services through the admin API (Minecraft, TeamSpeak). One per provider and user.
 * Steam IDs live in `account` (provider `steam`) since Steam login exists; old `steam` rows here were moved there
 * by migration 0001 and are no longer read.
 */
export const externalLink = pgTable(
  "external_link",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** `steam` only in rows from before migration 0001 (no longer read). */
    provider: text().$type<"minecraft" | "teamspeak" | "steam">().notNull(),
    providerAccountId: text().notNull(),
    displayName: text(),
    createdAt,
    updatedAt,
  },
  (t) => [
    uniqueIndex("external_link_provider_account_idx").on(t.provider, t.providerAccountId),
    uniqueIndex("external_link_user_provider_idx").on(t.userId, t.provider),
  ],
)

/** Used `openid.response_nonce` values of Steam OpenID assertions, kept for their validity window (replay protection). */
export const openidNonce = pgTable(
  "openid_nonce",
  {
    nonce: text().primaryKey(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index("openid_nonce_expires_idx").on(t.expiresAt)],
)

/** Uploaded profile pictures (256 px WebP), served at /api/avatar/<user id>. */
export const avatar = pgTable("avatar", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  contentType: text().notNull(),
  data: bytea().notNull(),
  updatedAt,
})

/** Security-relevant events, shown to the user under "Sicherheit". Deleted with the account. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: text().references(() => user.id, { onDelete: "cascade" }),
    event: text().notNull(),
    success: boolean().notNull().default(true),
    ipAddress: text(),
    userAgent: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdAt,
  },
  (t) => [index("audit_log_user_created_idx").on(t.userId, t.createdAt)],
)

/** Platform events (contract §4) waiting for delivery; `id` is the envelope id and idempotency key. */
export const eventOutbox = pgTable(
  "event_outbox",
  {
    id: uuid().primaryKey(),
    type: text().notNull(),
    sub: text(),
    envelope: jsonb().$type<Record<string, unknown>>().notNull(),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lockedUntil: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    lastError: text(),
    createdAt,
  },
  (t) => [index("event_outbox_pending_idx").on(t.deliveredAt, t.nextAttemptAt)],
)

/** Which old account of which app belongs to which Tretu ID (written by the legacy import and the claim flow). */
export const legacyLink = pgTable(
  "legacy_link",
  {
    id: uuid().primaryKey().defaultRandom(),
    app: text().$type<"saga" | "play" | "tretu-web" | "hollowmere">().notNull(),
    legacyUserId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    legacyUsername: text(),
    legacyEmail: text(),
    /** The old password hash in the stored format of lib/passwords.ts, for the claim flow. */
    passwordHash: text(),
    method: text().$type<"import" | "merge" | "claim">().notNull().default("import"),
    importedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp({ withTimezone: true }),
    createdAt,
  },
  (t) => [uniqueIndex("legacy_link_app_user_idx").on(t.app, t.legacyUserId), index("legacy_link_user_idx").on(t.userId)],
)
