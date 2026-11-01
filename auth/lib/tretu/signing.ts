import { createHash, createHmac, timingSafeEqual } from "node:crypto"

/** Signed server-to-server requests, Tretu ecosystem contract §3. */

export const SIGNATURE_MAX_SKEW_SECONDS = 300

export function sha256Hex(body: string | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex")
}

/** `timestamp \n METHOD \n pathWithQuery \n sha256hex(rawBody)` */
export function signatureBase(timestamp: string, method: string, pathWithQuery: string, rawBody: string | Uint8Array): string {
  return `${timestamp}\n${method.toUpperCase()}\n${pathWithQuery}\n${sha256Hex(rawBody)}`
}

export function computeSignature(secret: string, timestamp: string, method: string, pathWithQuery: string, rawBody: string | Uint8Array): string {
  return `v1=${createHmac("sha256", secret).update(signatureBase(timestamp, method, pathWithQuery, rawBody)).digest("hex")}`
}

export interface SignedHeaders {
  "x-tretu-app": string
  "x-tretu-timestamp": string
  "x-tretu-signature": string
}

export function signRequest(input: {
  appId: string
  secret: string
  method: string
  pathWithQuery: string
  body?: string
  now?: number
}): SignedHeaders {
  const timestamp = String(Math.floor((input.now ?? Date.now()) / 1000))
  return {
    "x-tretu-app": input.appId,
    "x-tretu-timestamp": timestamp,
    "x-tretu-signature": computeSignature(input.secret, timestamp, input.method, input.pathWithQuery, input.body ?? ""),
  }
}

/** Constant-time comparison of two signature strings (different lengths never match). */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) {
    // Keep the timing independent of where the strings differ.
    timingSafeEqual(left, left)
    return false
  }
  return timingSafeEqual(left, right)
}

export type VerifyResult = { ok: true; app: string } | { ok: false; reason: "missing" | "unknown_app" | "stale" | "bad_signature" }

/**
 * Verifies a signed request. `secrets` maps app id → secret; `rawBody` must be the exact bytes received.
 */
export function verifySignedRequest(input: {
  headers: Headers
  method: string
  pathWithQuery: string
  rawBody: string | Uint8Array
  secrets: Record<string, string>
  now?: number
}): VerifyResult {
  const app = input.headers.get("x-tretu-app")
  const timestamp = input.headers.get("x-tretu-timestamp")
  const signature = input.headers.get("x-tretu-signature")
  if (!app || !timestamp || !signature) return { ok: false, reason: "missing" }
  const secret = Object.hasOwn(input.secrets, app) ? input.secrets[app] : undefined
  if (!secret) return { ok: false, reason: "unknown_app" }
  if (!/^\d{1,12}$/.test(timestamp)) return { ok: false, reason: "stale" }
  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000)
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_MAX_SKEW_SECONDS) return { ok: false, reason: "stale" }
  const expected = computeSignature(secret, timestamp, input.method, input.pathWithQuery, input.rawBody)
  if (!safeEqual(expected, signature)) return { ok: false, reason: "bad_signature" }
  return { ok: true, app }
}
