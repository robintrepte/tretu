import { randomUUID } from "node:crypto"
import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"
import postgres from "postgres"
import { signRequest } from "../lib/tretu/signing"
import { withoutPasskeyAutofill } from "./login-page"

/**
 * The account lock as people see it: the friendly message for every way of signing in in the browser (passkey,
 * password, Steam), and the admin actions in the account's "Sicherheit" activity log, in German and English. The
 * admin actions are made through the admin API, signed as tretu.de.
 */

const outbox = path.join(import.meta.dirname, "..", ".outbox", "e2e")
const steamStub = `http://127.0.0.1:${process.env.E2E_STEAM_PORT ?? 3197}`
const baseURL = `http://localhost:${process.env.E2E_PORT ?? 3131}`
const secret = process.env.E2E_TRETU_WEB_SECRET ?? "e2e-tretu-web-secret-0123456789abcdef"
const sql = postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres@localhost:5432/tretu_auth_test_e2e", { max: 1, onnotice: () => {} })
let n = 0
let actorSub = ""

test.beforeAll(async () => {
  actorSub = randomUUID()
  const name = `e2eadmin_${Date.now().toString(36)}`
  await sql`insert into "user" (id, name, email, email_verified, username, display_username, roles, two_factor_enabled)
            values (${actorSub}, 'E2E Admin', ${`${name}@example.test`}, true, ${name}, ${name}, ${["admin"]}, true)`
})
test.afterAll(async () => {
  await sql.end()
})

async function adminApi(sub: string, action: "lock" | "unlock", body: Record<string, unknown>) {
  const pathWithQuery = `/api/v1/admin/users/${sub}/${action}`
  const raw = JSON.stringify({ actorSub, ...body })
  const headers = signRequest({ appId: "tretu-web", secret, method: "POST", pathWithQuery, body: raw })
  const res = await fetch(`${baseURL}${pathWithQuery}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: raw })
  expect(res.status, await res.clone().text()).toBe(200)
}

async function mailLinkFor(to: string): Promise<string> {
  for (let i = 0; i < 50; i++) {
    const files = (await readdir(outbox).catch(() => [] as string[])).sort().reverse()
    for (const file of files) {
      const mail = JSON.parse(await readFile(path.join(outbox, file), "utf8")) as { to: string; text: string }
      if (mail.to === to) return mail.text.match(/https?:\/\/\S+/)![0]
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`no mail to ${to}`)
}

async function signedInUser(page: Page, prefix: string) {
  const id = `${Date.now().toString(36)}${++n}`
  const user = { username: `${prefix}_${id}`.slice(0, 24), email: `${prefix}.${id}@example.test`, password: "ein langes geheimes Passwort 9", name: `${prefix} ${id}` }
  const res = await page.request.post("/api/auth/sign-up/email", { data: { ...user, callbackURL: "/konto" }, headers: { origin: baseURL } })
  expect(res.ok()).toBe(true)
  await page.goto(await mailLinkFor(user.email))
  await expect(page).toHaveURL(/\/konto/)
  const [row] = await sql<{ id: string }[]>`select id from "user" where email = ${user.email}`
  return { ...user, id: row!.id }
}

test("a locked account sees why at every sign-in, and the lock in its activity log", async ({ page, context }) => {
  await withoutPasskeyAutofill(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  const user = await signedInUser(page, "lck")
  await page.goto("/konto?tab=sicherheit")
  await page.getByRole("button", { name: "Passkey hinzufügen" }).click()
  await expect(page.getByText("Passkey hinzugefügt.")).toBeVisible()

  // Locked by an admin until a date: the browser is signed out at once.
  const until = new Date(Date.now() + 2 * 86_400_000)
  until.setUTCSeconds(0, 0)
  await adminApi(user.id, "lock", { reason: "E2E-Grund: Spam", until: until.toISOString() })
  await page.goto("/konto")
  await expect(page).toHaveURL(/\/login/)

  await page.getByRole("button", { name: "Mit Passkey anmelden" }).click()
  await expect(page.getByRole("alert").filter({ hasText: "Dein Tretu-Konto ist bis" })).toBeVisible()
  await expect(page).toHaveURL(/\/login/)

  await page.getByLabel("E-Mail oder Benutzername").fill(user.username)
  await page.getByLabel("Passwort", { exact: true }).fill(user.password)
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  const message = page.getByRole("alert").filter({ hasText: "Dein Tretu-Konto ist bis" })
  await expect(message).toBeVisible()
  await expect(message).toContainText("wende dich bitte an das Tretu-Team")

  // Unlocked: the passkey works again, and "Sicherheit" tells what happened (without the admin's reason).
  await adminApi(user.id, "unlock", { reason: "E2E: Einspruch angenommen" })
  await page.getByRole("button", { name: "Mit Passkey anmelden" }).click()
  await expect(page).toHaveURL(/\/konto/)
  // The sign-in is remembered on the passkey (shown to admins in the central admin).
  const [passkey] = await sql<{ last_used_at: Date | null }[]>`select last_used_at from passkey where user_id = ${user.id}`
  expect(passkey!.last_used_at).toBeInstanceOf(Date)
  await page.goto("/konto?tab=sicherheit")
  await expect(page.getByText(/^Konto vom Tretu-Team bis .+ gesperrt$/)).toBeVisible()
  await expect(page.getByText("Konto vom Tretu-Team entsperrt")).toBeVisible()
  await expect(page.getByText("Anmeldung abgelehnt: Konto gesperrt").first()).toBeVisible()
  await expect(page.getByText(/E2E-Grund|Einspruch/)).toHaveCount(0)

  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL }])
  await page.reload()
  await expect(page.getByText(/^Account locked by the Tretu team until /)).toBeVisible()
  await expect(page.getByText("Account unlocked by the Tretu team")).toBeVisible()
  await expect(page.getByText("Sign-in refused: account locked").first()).toBeVisible()
})

test("Mit Steam anmelden on a locked account ends on the login page with the message", async ({ page }) => {
  const steamId = String(76561198800000000n + BigInt(Date.now() % 1_000_000))
  await fetch(`${steamStub}/__stub/next`, { method: "POST", body: JSON.stringify({ steamId }) })
  await page.goto("/login")
  await page.getByRole("button", { name: "Mit Steam anmelden" }).click()
  await expect(page).toHaveURL(/\/konto/)
  const [row] = await sql<{ user_id: string }[]>`select user_id from account where provider_id = 'steam' and account_id = ${steamId}`
  await adminApi(row!.user_id, "lock", { reason: "E2E Steam" })

  await page.goto("/konto")
  await expect(page).toHaveURL(/\/login/)
  await page.waitForLoadState("networkidle")
  await fetch(`${steamStub}/__stub/next`, { method: "POST", body: JSON.stringify({ steamId }) })
  await page.getByRole("button", { name: "Mit Steam anmelden" }).click()
  await expect(page).toHaveURL(/\/login\?error=ACCOUNT_LOCKED/)
  await expect(page.getByRole("alert").filter({ hasText: "Dein Tretu-Konto ist gesperrt." })).toBeVisible()
})
