import { createHash } from "node:crypto"
import bcrypt from "bcryptjs"
import { hashPassword as hashNative, verifyPassword as verifyNative } from "better-auth/crypto"

/**
 * Stored password formats in `account.password`:
 * - native Better Auth scrypt (`<salt hex>:<key hex>`), also what Play stored, copied as-is;
 * - `bcrypt:<$2a$/$2b$/$2y$ hash>` imported from Saga or Nakama;
 * - `multi:<base64url JSON array of stored hashes>` when one person had passwords in several old apps:
 *   any of them signs in.
 * After a successful sign-in with a non-native hash, the password is re-hashed to the native format.
 */

export const BCRYPT_PREFIX = "bcrypt:"
export const MULTI_PREFIX = "multi:"

const BCRYPT_PATTERN = /^\$2[abxy]\$\d{2}\$[./A-Za-z0-9]{53}$/
const NATIVE_PATTERN = /^[0-9a-f]{32}:[0-9a-f]{128}$/

export function isNativeHash(stored: string): boolean {
  return NATIVE_PATTERN.test(stored)
}

export function needsRehash(stored: string | null | undefined): boolean {
  return typeof stored === "string" && !isNativeHash(stored)
}

/** Wraps a raw bcrypt hash (string or Nakama's bytea) in the stored format, or returns null if it is not bcrypt. */
export function fromBcrypt(raw: string | Uint8Array | null | undefined): string | null {
  if (raw == null) return null
  const text = (typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8")).trim()
  return BCRYPT_PATTERN.test(text) ? `${BCRYPT_PREFIX}${text}` : null
}

/** A Better Auth hash copied from Play, or null if it does not look like one. */
export function fromNative(raw: string | null | undefined): string | null {
  return raw && isNativeHash(raw) ? raw : null
}

/** Combines several stored hashes (deduplicated, order kept) into one stored value. */
export function combineStored(hashes: ReadonlyArray<string | null | undefined>): string | null {
  const list = [...new Set(hashes.filter((h): h is string => Boolean(h)).flatMap(expandStored))]
  if (list.length === 0) return null
  if (list.length === 1) return list[0]!
  return `${MULTI_PREFIX}${Buffer.from(JSON.stringify(list)).toString("base64url")}`
}

function expandStored(stored: string): string[] {
  if (!stored.startsWith(MULTI_PREFIX)) return [stored]
  try {
    const parsed: unknown = JSON.parse(Buffer.from(stored.slice(MULTI_PREFIX.length), "base64url").toString("utf8"))
    return Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string" && !h.startsWith(MULTI_PREFIX)) : []
  } catch {
    return []
  }
}

/** Checks a password against any stored format. Never throws for malformed hashes. */
export async function verifyStoredPassword(stored: string | null | undefined, password: string): Promise<boolean> {
  if (!stored || !password) return false
  for (const hash of expandStored(stored)) {
    try {
      if (hash.startsWith(BCRYPT_PREFIX)) {
        const raw = hash.slice(BCRYPT_PREFIX.length)
        // bcrypt only reads the first 72 bytes; longer inputs could never have been set in the old apps anyway.
        if (BCRYPT_PATTERN.test(raw) && (await bcrypt.compare(password, raw.replace(/^\$2y\$/, "$2b$")))) return true
      } else if (isNativeHash(hash) && (await verifyNative({ hash, password }))) {
        return true
      }
    } catch {
      // A broken hash never matches.
    }
  }
  return false
}

export async function hashPassword(password: string): Promise<string> {
  return hashNative(password)
}

/* ───────────────────────── Have I Been Pwned (k-anonymity) ───────────────────────── */

export function hibpParts(password: string): { prefix: string; suffix: string } {
  const sha1 = createHash("sha1").update(password).digest("hex").toUpperCase()
  return { prefix: sha1.slice(0, 5), suffix: sha1.slice(5) }
}

export function hibpCount(rangeBody: string, suffix: string): number {
  for (const line of rangeBody.split(/\r?\n/)) {
    const [hashSuffix, count] = line.trim().split(":")
    if (hashSuffix?.toUpperCase() === suffix) return Number.parseInt(count ?? "0", 10) || 0
  }
  return 0
}

/**
 * Whether the password appears in a known breach. Only the first five hex characters of its SHA-1 leave the
 * server. Fails open: on network errors or timeouts it returns false, so an outage never blocks sign-ups.
 */
export async function isBreachedPassword(password: string, options: { timeoutMs?: number; fetchImpl?: typeof fetch } = {}): Promise<boolean> {
  const { prefix, suffix } = hibpParts(password)
  try {
    const response = await (options.fetchImpl ?? fetch)(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "tretu-auth" },
      signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
    })
    if (!response.ok) return false
    return hibpCount(await response.text(), suffix) > 0
  } catch {
    return false
  }
}
