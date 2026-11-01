import { describe, expect, it } from "vitest"
import { computeSignature, sha256Hex, signRequest, verifySignedRequest } from "@/lib/tretu/signing"

// Test vectors from the ecosystem contract §3.
const secret = "test-secret-123"
const timestamp = "1767225600"
const body =
  '{"id":"0b9f1c2e-1111-4a5b-8c9d-123456789abc","type":"stat.increment","app":"saga","sub":"user-sub-1","occurredAt":"2026-01-01T00:00:00.000Z","data":{"key":"saga.turns","by":1}}'

describe("contract §3 signing", () => {
  it("hashes the POST body", () => {
    expect(sha256Hex(body)).toBe("4602011a4e61b23f5671fd07a722d0dbfa8ceefa4556218afc5d4aee7292062b")
  })

  it("reproduces the POST vector", () => {
    expect(computeSignature(secret, timestamp, "POST", "/api/v1/events", body)).toBe(
      "v1=f1a93767113e533347f3fc19e2ea26de609e2848ca366017516d7752c230243d",
    )
  })

  it("reproduces the GET vector with an empty body", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
    expect(computeSignature(secret, timestamp, "GET", "/api/v1/wallet/user-sub-1", "")).toBe(
      "v1=2b0726b5f46af3137ecc0e51e27183533e357d620e2ab128fd7165610bc9ca6f",
    )
  })

  it("uppercases the method", () => {
    expect(computeSignature(secret, timestamp, "post", "/api/v1/events", body)).toBe(computeSignature(secret, timestamp, "POST", "/api/v1/events", body))
  })

  const now = Number(timestamp) * 1000
  const headersFor = (sig: string, app = "saga", ts = timestamp) =>
    new Headers({ "x-tretu-app": app, "x-tretu-timestamp": ts, "x-tretu-signature": sig })

  it("accepts the vector and rejects tampering", () => {
    const sig = "v1=f1a93767113e533347f3fc19e2ea26de609e2848ca366017516d7752c230243d"
    const base = { method: "POST", pathWithQuery: "/api/v1/events", rawBody: body, secrets: { saga: secret }, now }
    expect(verifySignedRequest({ ...base, headers: headersFor(sig) })).toEqual({ ok: true, app: "saga" })
    expect(verifySignedRequest({ ...base, headers: headersFor(sig), rawBody: body + " " })).toEqual({ ok: false, reason: "bad_signature" })
    expect(verifySignedRequest({ ...base, headers: headersFor(sig), pathWithQuery: "/api/v1/events?x=1" })).toEqual({ ok: false, reason: "bad_signature" })
    expect(verifySignedRequest({ ...base, headers: headersFor(sig.slice(0, -1)) })).toEqual({ ok: false, reason: "bad_signature" })
    expect(verifySignedRequest({ ...base, headers: headersFor(sig, "play") })).toEqual({ ok: false, reason: "unknown_app" })
    expect(verifySignedRequest({ ...base, headers: headersFor(sig, "__proto__") })).toEqual({ ok: false, reason: "unknown_app" })
    expect(verifySignedRequest({ ...base, headers: new Headers() })).toEqual({ ok: false, reason: "missing" })
  })

  it("rejects timestamps more than 300 s away", () => {
    const base = { method: "GET", pathWithQuery: "/x", rawBody: "", secrets: { saga: secret } }
    const signed = signRequest({ appId: "saga", secret, method: "GET", pathWithQuery: "/x", now })
    const headers = new Headers({ ...signed })
    expect(verifySignedRequest({ ...base, headers, now: now + 300_000 }).ok).toBe(true)
    expect(verifySignedRequest({ ...base, headers, now: now + 301_000 })).toEqual({ ok: false, reason: "stale" })
    expect(verifySignedRequest({ ...base, headers, now: now - 301_000 })).toEqual({ ok: false, reason: "stale" })
  })
})
