/** Better Auth error codes → message keys, shared by the auth forms. */
export function errorCode(error: unknown): string | undefined {
  if (error && typeof error === "object") {
    const e = error as { code?: unknown; status?: unknown }
    if (typeof e.code === "string") return e.code
    if (e.status === 429) return "RATE_LIMITED"
  }
  return undefined
}

export const isRateLimited = (error: unknown) => {
  const e = error as { status?: number; code?: string } | null
  return e?.status === 429 || e?.code === "RATE_LIMITED" || e?.code === "TOO_MANY_REQUESTS"
}
