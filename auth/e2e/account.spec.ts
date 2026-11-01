import { readdir, readFile } from "node:fs/promises"
import path from "node:path"
import { expect, test } from "@playwright/test"

const outbox = path.join(import.meta.dirname, "..", ".outbox", "e2e")

/** The newest email to `to` from the test outbox (the "dev email log" the server writes). */
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

test("register → verify email → sign in → Mein Konto", async ({ page }) => {
  const id = Date.now().toString(36)
  const user = { username: `e2e_${id}`, email: `e2e.${id}@example.test`, password: "ein langes geheimes Passwort 7" }

  await page.goto("/registrieren")
  await expect(page.getByRole("heading", { name: "Konto erstellen" })).toBeVisible()
  await page.getByLabel("Benutzername").fill(user.username)
  await page.getByLabel("Anzeigename").fill("E2E Tester")
  await page.getByLabel("E-Mail-Adresse").fill(user.email)
  await page.getByLabel("Passwort", { exact: true }).fill(user.password)
  await page.getByRole("button", { name: "Konto erstellen" }).click()
  await expect(page.getByText("Fast geschafft!")).toBeVisible()

  // The confirmation link signs the user in and lands on the account page.
  await page.goto(await mailLinkFor(user.email))
  await expect(page).toHaveURL(/\/konto/)
  await expect(page.getByRole("heading", { name: "Hallo, E2E Tester!" })).toBeVisible()

  // Sign out, then sign in again with the username.
  await page.getByRole("button", { name: "Abmelden" }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.getByLabel("E-Mail oder Benutzername").fill(user.username)
  await page.getByLabel("Passwort", { exact: true }).fill(user.password)
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expect(page).toHaveURL(/\/konto/)

  // Mein Konto: profile, apps, security tab with the activity log.
  await expect(page.getByLabel("Benutzername")).toHaveValue(user.username)
  await expect(page.getByText("Deine Tretu-Apps")).toBeVisible()
  await page.getByRole("link", { name: "Sicherheit" }).click()
  await expect(page.getByRole("heading", { name: "Passkeys" })).toBeVisible()
  await expect(page.getByText("Konto erstellt")).toBeVisible()
  await expect(page.getByText(/^Anmeldung · über Passwort/).first()).toBeVisible()

  // Switch to English: the page and the saved language follow.
  await page.getByRole("link", { name: "Sprache" }).click()
  await page.getByRole("radio", { name: "English" }).click()
  await expect(page.getByRole("link", { name: "Security" })).toBeVisible()
})

test("wrong password shows a friendly error", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("E-Mail oder Benutzername").fill("nobody@example.test")
  await page.getByLabel("Passwort", { exact: true }).fill("definitely wrong")
  await page.getByRole("button", { name: "Anmelden", exact: true }).click()
  await expect(page.getByRole("alert").filter({ hasText: "stimmt nicht" })).toBeVisible()
})

test("login page works on a phone @mobile", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("heading", { name: "Anmelden" })).toBeVisible()
  await expect(page.getByRole("button", { name: "Mit Passkey anmelden" })).toBeVisible()
})
