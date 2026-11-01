/**
 * Signed server-to-server requests (ecosystem contract §3).
 *
 * base = timestamp + "\n" + METHOD + "\n" + pathWithQuery + "\n" + sha256hex(rawBody)
 * x-tretu-signature = "v1=" + hex(HMAC_SHA256(secret, base))
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const HEADER_APP = "x-tretu-app";
export const HEADER_TIMESTAMP = "x-tretu-timestamp";
export const HEADER_SIGNATURE = "x-tretu-signature";
/** Max allowed |now - timestamp| in seconds. */
export const SIGNATURE_WINDOW_SEC = 300;

export type SignatureInput = {
  timestamp: string | number;
  method: string;
  /** URL path plus `?query` exactly as sent, no host. */
  pathWithQuery: string;
  /** Exact bytes sent (empty for GET/DELETE without body). */
  body: string | Uint8Array;
};

export function sha256Hex(body: string | Uint8Array): string {
  return createHash("sha256").update(body).digest("hex");
}

export function signatureBase(input: SignatureInput): string {
  return `${String(input.timestamp)}\n${input.method.toUpperCase()}\n${input.pathWithQuery}\n${sha256Hex(input.body)}`;
}

export function computeSignature(secret: string, input: SignatureInput): string {
  return `v1=${createHmac("sha256", secret).update(signatureBase(input)).digest("hex")}`;
}

/** Headers for an outgoing signed request. */
export function signedHeaders(
  app: string,
  secret: string,
  input: Omit<SignatureInput, "timestamp"> & { timestamp?: string | number },
  now: Date = new Date()
): Record<string, string> {
  const timestamp = String(input.timestamp ?? Math.floor(now.getTime() / 1000));
  return {
    [HEADER_APP]: app,
    [HEADER_TIMESTAMP]: timestamp,
    [HEADER_SIGNATURE]: computeSignature(secret, { ...input, timestamp }),
  };
}

export type VerifyResult = { ok: true } | { ok: false; reason: "timestamp" | "signature" };

/** Constant-time signature check plus the ±300 s timestamp window. */
export function verifySignature(
  secret: string,
  input: SignatureInput & { signature: string | null | undefined },
  now: Date = new Date()
): VerifyResult {
  const tsRaw = String(input.timestamp);
  if (!/^\d{1,12}$/.test(tsRaw)) return { ok: false, reason: "timestamp" };
  const ts = Number(tsRaw);
  if (Math.abs(Math.floor(now.getTime() / 1000) - ts) > SIGNATURE_WINDOW_SEC) {
    return { ok: false, reason: "timestamp" };
  }
  const expected = Buffer.from(computeSignature(secret, { ...input, timestamp: tsRaw }), "utf8");
  const given = Buffer.from(String(input.signature ?? ""), "utf8");
  // Compare equal-length buffers only; still do a dummy compare to keep timing uniform.
  if (given.length !== expected.length) {
    timingSafeEqual(expected, expected);
    return { ok: false, reason: "signature" };
  }
  return timingSafeEqual(expected, given) ? { ok: true } : { ok: false, reason: "signature" };
}
