import { readdir, readFile } from "node:fs/promises"
import http from "node:http"
import path from "node:path"
import { ISSUER, OUTBOX_DIR } from "./env"

/** A minimal cookie jar: enough to act like one browser against the app. */
export class Jar {
  readonly cookies = new Map<string, string>()
  update(response: Response) {
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attrs] = cookie.split(";")
      const index = pair!.indexOf("=")
      const name = pair!.slice(0, index).trim()
      const value = pair!.slice(index + 1).trim()
      const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === ""
      if (expired) this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }
  header() {
    return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ")
  }
  has(fragment: string) {
    return [...this.cookies.keys()].some((k) => k.includes(fragment))
  }
}

/**
 * Like a browser: no redirects followed, the jar's cookies sent. Node's fetch always claims
 * `sec-fetch-mode: cors`, so requests go through node:http: GETs look like page navigations, JSON posts like
 * the auth client's fetch calls.
 */
export async function request(jar: Jar, url: string | URL, init: { method?: string; json?: unknown; headers?: Record<string, string> } = {}): Promise<Response> {
  const target = new URL(url, ISSUER)
  const body = init.json !== undefined ? JSON.stringify(init.json) : undefined
  const headers: Record<string, string> = {
    accept: body ? "application/json" : "text/html",
    "user-agent": "Mozilla/5.0 (X11; Linux x86_64) integration-test",
    "sec-fetch-mode": body ? "cors" : "navigate",
    ...init.headers,
  }
  const cookie = jar.header()
  if (cookie) headers.cookie = cookie
  if (body) {
    headers["content-type"] = "application/json"
    headers.origin = ISSUER
    headers["content-length"] = String(Buffer.byteLength(body))
  }
  const response = await new Promise<Response>((resolve, reject) => {
    const req = http.request(target, { method: init.method ?? "GET", headers }, (res) => {
      const chunks: Buffer[] = []
      res.on("data", (c: Buffer) => chunks.push(c))
      res.on("end", () => {
        const out = new Headers()
        for (const [key, value] of Object.entries(res.headers)) {
          if (Array.isArray(value)) for (const v of value) out.append(key, v)
          else if (value !== undefined) out.set(key, value)
        }
        const status = res.statusCode ?? 0
        const payload = status === 204 || status === 304 ? null : Buffer.concat(chunks)
        resolve(new Response(payload, { status, headers: out }))
      })
    })
    req.on("error", reject)
    if (body) req.write(body)
    req.end()
  })
  jar.update(response)
  return response
}

export interface StoredMail {
  to: string
  subject: string
  text: string
  html: string
}

/** Waits for the newest email to `to` in the test outbox (MAIL_OUTBOX_DIR). */
export async function waitForMail(to: string, match: RegExp = /./, timeoutMs = 10_000): Promise<StoredMail> {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    let files: string[] = []
    try {
      files = (await readdir(OUTBOX_DIR)).sort().reverse()
    } catch {
      // not created yet
    }
    for (const file of files) {
      const mail = JSON.parse(await readFile(path.join(OUTBOX_DIR, file), "utf8")) as StoredMail
      if (mail.to.toLowerCase() === to.toLowerCase() && match.test(mail.subject)) return mail
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no mail to ${to}`)
}

export function linkIn(mail: StoredMail): string {
  const url = mail.text.match(/https?:\/\/\S+/)?.[0]
  if (!url) throw new Error("no link in mail")
  return url
}

let counter = 0
export function uniqueUser(prefix = "tester") {
  counter += 1
  const id = `${Date.now().toString(36)}${counter}`
  return { username: `${prefix}_${id}`.slice(0, 24), email: `${prefix}.${id}@example.test`.toLowerCase(), password: "correct horse battery staple 42", name: `Test ${id}` }
}

/** Registers a user through the API and confirms the email by following the link from the outbox. */
export async function registerVerifiedUser(prefix?: string) {
  const user = uniqueUser(prefix)
  const jar = new Jar()
  const signUp = await request(jar, "/api/auth/sign-up/email", { method: "POST", json: { ...user, callbackURL: "/konto" } })
  if (!signUp.ok) throw new Error(`sign-up failed: ${signUp.status} ${await signUp.text()}`)
  const mail = await waitForMail(user.email)
  const verify = await request(jar, linkIn(mail))
  if (verify.status !== 302) throw new Error(`verify failed: ${verify.status}`)
  const session = await request(jar, "/api/auth/get-session")
  const body = (await session.json()) as { user: { id: string } } | null
  if (!body) throw new Error("no session after verification")
  return { ...user, id: body.user.id, jar }
}
