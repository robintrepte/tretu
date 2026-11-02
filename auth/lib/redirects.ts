/**
 * Open-redirect protection for every redirect parameter (`next`, `callbackURL`, `errorCallbackURL`, …).
 * Pure, unit-tested in tests/unit/redirects.test.ts.
 *
 * A target is accepted only as a same-site path (`/konto?tab=…`) or an absolute URL on the issuer's own
 * origin. Browsers drop tabs and newlines inside URLs and treat `\` like `/`, so `/\t/evil.example` or
 * `/\evil.example` would become protocol-relative: anything with whitespace, control characters or a
 * backslash is refused outright.
 */

const UNSAFE_CHARS = /[\s\\\u0000-\u001f\u007f]/

/** Whether `value` is a path on this site that cannot turn into another origin. */
export function isSafeRelativePath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || UNSAFE_CHARS.test(value)) return false
  try {
    // Resolving against a dummy origin must stay on that origin.
    return new URL(value, "https://tretu.invalid").origin === "https://tretu.invalid"
  } catch {
    return false
  }
}

/** A safe same-site path for `value` (a path, or an absolute URL on `issuer`), else null. */
export function toSafePath(value: unknown, issuer: string): string | null {
  if (typeof value !== "string" || !value || value.length > 2048) return null
  if (isSafeRelativePath(value)) return value
  if (UNSAFE_CHARS.test(value)) return null
  try {
    const url = new URL(value)
    const own = new URL(issuer)
    if (url.origin !== own.origin || url.username || url.password) return null
    const path = `${url.pathname}${url.search}${url.hash}`
    return isSafeRelativePath(path) ? path : null
  } catch {
    return null
  }
}

/** Only relative, same-site paths are accepted as "next" targets. */
export function safeNext(value: string | string[] | undefined, fallback = "/konto"): string {
  const next = Array.isArray(value) ? value[0] : value
  return next && isSafeRelativePath(next) ? next : fallback
}

/** Better Auth parameters that end up as a redirect after an email link or provider sign-in. */
export const REDIRECT_PARAMS = ["callbackURL", "errorCallbackURL", "newUserCallbackURL", "redirectTo"] as const

/**
 * Where an app sign-in continues after a step that happened outside the signed login request (second factor
 * after Discord/Google/Apple/Steam, or Steam itself): the authorization endpoint again, with the app's original
 * request. The new session is fresh, so `prompt=login` and `max_age` are already satisfied and dropped
 * (otherwise the user would be asked to sign in again).
 */
export function authorizeContinuation(query: string): string {
  const params = new URLSearchParams(query)
  for (const key of ["sig", "exp", "ba_iat", "ba_pl", "ba_param", "max_age"]) params.delete(key)
  const prompt = (params.get("prompt") ?? "")
    .split(" ")
    .filter((p) => p && p !== "login" && p !== "select_account")
  if (prompt.length) params.set("prompt", prompt.join(" "))
  else params.delete("prompt")
  return `/api/auth/oauth2/authorize?${params.toString()}`
}
