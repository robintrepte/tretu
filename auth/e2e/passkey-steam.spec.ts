import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test, type Page } from "@playwright/test"
import { withoutPasskeyAutofill } from "./login-page"

const outbox = path.join(import.meta.dirname, "..", ".outbox", "e2e")
const steamStub = `http://127.0.0.1:${process.env.E2E_STEAM_PORT ?? 3197}`
const baseURL = `http://localhost:${process.env.E2E_PORT ?? 3131}`
let n = 0

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

/** A confirmed account, signed in in `page` (sign-up through the API, confirmation link in the browser). */
async function signedInUser(page: Page, prefix: string) {
  const id = `${Date.now().toString(36)}${++n}`
  const user = { username: `${prefix}_${id}`.slice(0, 24), email: `${prefix}.${id}@example.test`, password: "ein langes geheimes Passwort 7", name: `${prefix} ${id}` }
  const res = await page.request.post("/api/auth/sign-up/email", { data: { ...user, callbackURL: "/konto" }, headers: { origin: baseURL } })
  expect(res.ok()).toBe(true)
  await page.goto(await mailLinkFor(user.email))
  await expect(page).toHaveURL(/\/konto/)
  return user
}

/** The identity the stub Steam answers with next. */
async function steamAs(steamId: string) {
  await fetch(`${steamStub}/__stub/next`, { method: "POST", body: JSON.stringify({ steamId }) })
}

test("passkey: register in Mein Konto, sign out, sign in with it (RP ID = issuer host)", async ({ page }) => {
  await withoutPasskeyAutofill(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send("WebAuthn.enable")
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })

  const user = await signedInUser(page, "pk")
  await page.goto("/konto?tab=sicherheit")
  const options = page.waitForResponse((r) => r.url().includes("/api/auth/passkey/generate-register-options"))
  await page.getByRole("button", { name: "Passkey hinzufügen" }).click()
  const registerOptions = (await (await options).json()) as { rp: { id: string; name: string }; authenticatorSelection?: { residentKey?: string } }
  await expect(page.getByText("Passkey hinzugefügt.")).toBeVisible()
  // In this test the issuer is http://localhost:3131, so the RP ID is its host; production uses tretu.de (unit test).
  expect(registerOptions.rp).toMatchObject({ id: "localhost", name: "Tretu" })
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId })
  expect(credentials).toHaveLength(1)
  expect(credentials[0]!.rpId).toBe("localhost")
  expect(credentials[0]!.isResidentCredential).toBe(true)

  await page.getByRole("button", { name: "Abmelden", exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole("button", { name: "Mit Passkey anmelden" }).click()
  await expect(page).toHaveURL(/\/konto/)
  await expect(page.getByRole("heading", { name: `Hallo, ${user.name}!` })).toBeVisible()
  // The authenticator signed once more (sign count went up).
  const after = await cdp.send("WebAuthn.getCredentials", { authenticatorId })
  expect(after.credentials[0]!.signCount).toBeGreaterThan(credentials[0]!.signCount)
  await page.goto("/konto?tab=sicherheit")
  await expect(page.getByText(/über Passkey/).first()).toBeVisible()
})

test("Mit Steam anmelden: sign-up through Steam, Steam row in Verknüpfte Konten", async ({ page }) => {
  const steamId = String(76561198400000000n + BigInt(Date.now() % 1_000_000))
  await steamAs(steamId)
  await page.goto("/login")
  const button = page.getByRole("button", { name: "Mit Steam anmelden" })
  await expect(button).toBeVisible()
  await button.click()
  await expect(page).toHaveURL(/\/konto/)
  await expect(page.getByRole("heading", { name: "Hallo, Steam-Spieler!" })).toBeVisible()

  await page.goto("/konto?tab=konten")
  const steamRow = page.getByTestId("game-steam")
  await expect(steamRow).toContainText(steamId)
  // Steam is this account's only way to sign in: it cannot be disconnected.
  await expect(steamRow.getByRole("button", { name: "Trennen" })).toBeDisabled()
  const minecraft = page.getByTestId("game-minecraft")
  await expect(minecraft.getByRole("link", { name: "Verknüpfen" })).toHaveAttribute("href", "https://mc.tretu.de/verknuepfen")
  await expect(minecraft).toContainText("Tippe /dashboard im Spiel")
  const teamspeak = page.getByTestId("game-teamspeak")
  await expect(teamspeak.getByRole("link", { name: "Verknüpfen" })).toHaveAttribute("href", "https://tretu.de/einstellungen#teamspeak")
  await expect(teamspeak).toContainText("TeamSpeak-Namen")
})

test("connect and disconnect Steam in Mein Konto", async ({ page }) => {
  await signedInUser(page, "stl")
  const steamId = String(76561198500000000n + BigInt(Date.now() % 1_000_000))
  await steamAs(steamId)
  await page.goto("/konto?tab=konten")
  const steamRow = page.getByTestId("game-steam")
  await expect(steamRow).toContainText("Nicht verbunden")
  await steamRow.getByRole("button", { name: "Verknüpfen" }).click()
  await expect(page).toHaveURL(/\/konto\?tab=konten/)
  await expect(page.getByTestId("game-steam")).toContainText(steamId)

  page.once("dialog", (dialog) => void dialog.accept())
  await page.getByTestId("game-steam").getByRole("button", { name: "Trennen" }).click()
  await expect(page.getByTestId("game-steam")).toContainText("Nicht verbunden")
})

test("Steam button on the login page in English", async ({ page, context }) => {
  await context.addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL }])
  await page.goto("/login")
  await expect(page.getByRole("button", { name: "Sign in with Steam" })).toBeVisible()
})

test("a Steam-only account sets a password together with an email to confirm, then signs in with it", async ({ page }) => {
  const steamId = String(76561198600000000n + BigInt(Date.now() % 1_000_000))
  await steamAs(steamId)
  await page.goto("/login")
  await page.getByRole("button", { name: "Mit Steam anmelden" }).click()
  await expect(page).toHaveURL(/\/konto/)
  const username = await page.getByLabel("Benutzername").inputValue()

  await page.goto("/konto?tab=sicherheit")
  await expect(page.getByText("Für die Anmeldung mit Passwort brauchst du eine bestätigte E-Mail-Adresse")).toBeVisible()
  const email = `steam.${Date.now().toString(36)}@example.test`
  const password = "ein langes geheimes Passwort 8"
  await page.getByLabel("E-Mail-Adresse").fill(email)
  await page.getByLabel("Neues Passwort").fill(password)
  await page.getByRole("button", { name: "Passwort festlegen" }).click()
  await expect(page.getByText(`Bitte bestätige jetzt ${email}`)).toBeVisible()

  // Not confirmed yet: the password does not sign in.
  await page.getByRole("button", { name: "Abmelden", exact: true }).click()
  await page.getByLabel("E-Mail oder Benutzername").fill(username)
  await page.getByLabel("Passwort", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "bestätige zuerst deine E-Mail-Adresse" })).toBeVisible()

  // The link confirms the address (and signs in); afterwards username + password work.
  await page.goto(await mailLinkFor(email))
  await expect(page).toHaveURL(/\/konto/)
  await page.goto("/konto?tab=profil")
  await expect(page.getByText(email)).toBeVisible()
  await page.getByRole("button", { name: "Abmelden", exact: true }).click()
  await page.getByLabel("E-Mail oder Benutzername").fill(username)
  await page.getByLabel("Passwort", { exact: true }).fill(password)
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expect(page).toHaveURL(/\/konto/)
  await expect(page.getByRole("heading", { name: "Hallo, Steam-Spieler!" })).toBeVisible()
})
