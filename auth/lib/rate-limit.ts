/** A small in-memory limiter for the account page's own actions (Better Auth limits its endpoints itself). */
const hits = new Map<string, number[]>()

/** Returns true if the action is allowed, false once `max` actions happened within `windowMs`. */
export function rateLimit(key: string, max: number, windowMs: number, now = Date.now()): boolean {
  if (process.env.AUTH_RATE_LIMIT === "off") return true
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= max) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k)
  return true
}
