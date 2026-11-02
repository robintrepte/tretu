import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { TEST_DATABASE_URL } from "./env"
import { enableTwoFactor, Jar, registerVerifiedUser, request, sessionOf, type TotpDevice } from "./helpers"

/** A TOTP code (its 30 s time step) is accepted once per user: sign-in challenge, turning 2FA on, signed-in checks. */

const sql = postgres(TEST_DATABASE_URL, { max: 2, onnotice: () => {} })
afterAll(async () => {
  await sql.end()
})

let user: Awaited<ReturnType<typeof registerVerifiedUser>>
let device: TotpDevice

beforeAll(async () => {
  user = await registerVerifiedUser("replay")
  device = await enableTwoFactor(user.jar, user.password)
})

/** A browser that signed in with the password and now stands at the code entry. */
async function challenged(): Promise<Jar> {
  const browser = new Jar()
  const res = await request(browser, "/api/auth/sign-in/email", { method: "POST", json: { email: user.email, password: user.password } })
  expect(await res.json()).toMatchObject({ twoFactorRedirect: true })
  return browser
}

const verify = (jar: Jar, code: string) => request(jar, "/api/auth/two-factor/verify-totp", { method: "POST", json: { code } })
const codeOf = async (res: Response) => ((await res.json()) as { code?: string }).code

describe("TOTP replay protection", () => {
  it("does not accept the code that turned 2FA on for a sign-in", async () => {
    const enabledWith = device.lastStep()
    const browser = await challenged()
    const res = await verify(browser, await device.codeAt(enabledWith))
    expect(res.status).toBe(401)
    // Within the drift window it is recognised as reused; later it is simply too old.
    if (device.step() - enabledWith <= 1) expect(await codeOf(res)).toBe("TOTP_CODE_REUSED")
    expect(await sessionOf(browser)).toBeNull()
  })

  it("refuses the same code twice, accepts the next step's code, then refuses older ones", async () => {
    const code = await device.code()
    const step = device.lastStep()
    const first = await challenged()
    expect((await verify(first, code)).status).toBe(200)

    const second = await challenged()
    const again = await verify(second, code)
    expect(again.status).toBe(401)
    expect(await codeOf(again)).toBe("TOTP_CODE_REUSED")
    expect(await sessionOf(second)).toBeNull()

    // The next time step (allowed clock drift) is a new code and works, also in the same challenge.
    const next = await verify(second, await device.codeAt(step + 1))
    expect(next.status).toBe(200)
    device.markUsed(step + 1)
    expect((await sessionOf(second))?.user.id).toBe(user.id)

    // An older step after a newer one was accepted is refused as well.
    const third = await challenged()
    expect((await verify(third, code)).status).toBe(401)

    const [row] = await sql<{ last_totp_counter: string }[]>`select last_totp_counter from two_factor where user_id = ${user.id}`
    expect(Number(row!.last_totp_counter)).toBe(step + 1)
    const [audit] = await sql`select meta from audit_log where user_id = ${user.id} and event = '2fa.failed' and meta->>'code' = 'TOTP_CODE_REUSED' limit 1`
    expect(audit).toBeTruthy()
  })

  it("lets only one of two concurrent submissions of a code win", async () => {
    const code = await device.code()
    const [a, b] = await Promise.all([challenged(), challenged()])
    const results = await Promise.all([verify(a, code), verify(b, code)])
    expect(results.map((r) => r.status).sort()).toEqual([200, 401])
    const sessions = await Promise.all([sessionOf(a), sessionOf(b)])
    expect(sessions.filter(Boolean)).toHaveLength(1)
  }, 120_000) // may wait up to two 30 s steps for an unused code

  it("also refuses a used code for a signed-in check", async () => {
    const used = await device.codeAt(device.lastStep())
    const res = await verify(user.jar, used)
    expect(res.status).toBe(401)
    if (device.step() - device.lastStep() <= 1) expect(await codeOf(res)).toBe("TOTP_CODE_REUSED")
  })
})
