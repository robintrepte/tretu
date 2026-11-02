import type { Page } from "@playwright/test"

/**
 * The login page starts passkey autofill (conditional mediation) when it loads. In a test that clicks
 * "Mit Passkey anmelden" right after the page appears, that autofill races the button: its options response can
 * replace the challenge cookie the button's ceremony needs, and a pending conditional request can hold up the click.
 * People never click that fast; tests do. Tests of the button therefore run without autofill.
 */
export async function withoutPasskeyAutofill(page: Page): Promise<void> {
  await page.addInitScript(() => {
    if (window.PublicKeyCredential) window.PublicKeyCredential.isConditionalMediationAvailable = async () => false
  })
}
