/**
 * The hub's Tretu-Konto-only sign-in against the REAL auth.tretu.de: the login page offers nothing but
 * "Mit Tretu-Konto anmelden", and the first Tretu sign-in finds an existing local account through the
 * `legacy_ids` claim (legacy import) or a verified email, never through one already linked to another Tretu-Konto.
 */
import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";
import postgres from "postgres";

import { AUTH_DATABASE_URL, HUB_DATABASE_URL, HUB_URL } from "./env";
import { hubSession, signInToHub, signUp, uniqueName, type Account } from "./support";

test.describe.configure({ mode: "serial" });

const authDb = postgres(AUTH_DATABASE_URL, { max: 1, onnotice: () => {} });
const hubDb = postgres(HUB_DATABASE_URL, { max: 1, onnotice: () => {} });
const contexts: BrowserContext[] = [];

test.afterAll(async () => {
  for (const context of contexts) await context.close();
  await authDb.end();
  await hubDb.end();
});

const subOf = (username: string) => async () => {
  const [row] = await authDb<{ id: string }[]>`select id from "user" where username = ${username.toLowerCase()}`;
  if (!row) throw new Error(`no auth user ${username}`);
  return row.id;
};

async function newAccount(browser: import("@playwright/test").Browser, prefix: string): Promise<{ context: BrowserContext; account: Account }> {
  const context = await browser.newContext({ locale: "de-DE" });
  contexts.push(context);
  const name = uniqueName(prefix);
  return { context, account: await signUp(context, name, subOf(name)) };
}

async function hubUser(values: { displayName: string; email?: string; emailVerified?: boolean; tretuSub?: string }) {
  const [row] = await hubDb<{ id: number }[]>`
    insert into users (display_name, email, email_verified, tretu_sub)
    values (${values.displayName}, ${values.email ?? null}, ${values.emailVerified ?? false}, ${values.tretuSub ?? null})
    returning id`;
  return row!.id;
}

const linkedHubUsers = (sub: string) => hubDb<{ id: number }[]>`select id from users where tretu_sub = ${sub}`;

test("the login page offers only the Tretu-Konto", async ({ page }) => {
  await page.goto(`${HUB_URL}/login`);
  const main = page.locator("#main-content");
  await expect(main.getByRole("heading", { level: 1, name: "Anmelden" })).toBeVisible();
  await expect(main.getByRole("button")).toHaveText([/Mit Tretu-Konto anmelden/]);
  await expect(main.getByText(/Discord/)).toHaveCount(0);
  await expect(page.getByTestId("login-not-configured")).toHaveCount(0);
  // The removed provider is gone from Better Auth as well.
  const res = await page.request.post(`${HUB_URL}/api/auth/sign-in/social`, { data: { provider: "discord", callbackURL: "/" }, headers: { origin: HUB_URL } });
  expect(res.ok()).toBe(false);
});

test("legacy_ids[tretu-web] brings the person back to their old hub account", async ({ browser }) => {
  test.setTimeout(120_000);
  const { context, account } = await newAccount(browser, "alt");
  const oldId = await hubUser({ displayName: "Altes Hub-Konto" });
  // What auth's legacy import wrote for that old tretu.de account.
  await authDb`insert into legacy_link (app, legacy_user_id, user_id, legacy_username, method)
               values ('tretu-web', ${String(oldId)}, ${account.sub}, 'altes_konto', 'import')`;

  const page = await context.newPage();
  await signInToHub(page);
  expect((await hubSession(context))?.user.id).toBe(String(oldId));
  expect(await linkedHubUsers(account.sub)).toEqual([{ id: oldId }]);
  // Name and picture now come from the Tretu-Konto.
  const [row] = await hubDb<{ display_name: string }[]>`select display_name from users where id = ${oldId}`;
  expect(row!.display_name).toBe(account.name);
});

test("a verified email on both sides links the existing hub account", async ({ browser }) => {
  test.setTimeout(120_000);
  const { context, account } = await newAccount(browser, "mail");
  const existing = await hubUser({ displayName: "Mail-Konto", email: account.email, emailVerified: true });

  const page = await context.newPage();
  await signInToHub(page);
  expect((await hubSession(context))?.user.id).toBe(String(existing));
  expect(await linkedHubUsers(account.sub)).toEqual([{ id: existing }]);
});

test("an old account already linked to another Tretu-Konto is never taken: a new hub account is made", async ({ browser }) => {
  test.setTimeout(120_000);
  const { context, account } = await newAccount(browser, "neu");
  const otherSub = randomUUID();
  const taken = await hubUser({ displayName: "Schon verknüpft", email: account.email, emailVerified: true, tretuSub: otherSub });
  await authDb`insert into legacy_link (app, legacy_user_id, user_id, legacy_username, method)
               values ('tretu-web', ${String(taken)}, ${account.sub}, 'schon_verknuepft', 'import')`;

  const page = await context.newPage();
  await signInToHub(page);
  const session = await hubSession(context);
  expect(session).not.toBeNull();
  expect(session!.user.id).not.toBe(String(taken));
  const [fresh] = await linkedHubUsers(account.sub);
  expect(String(fresh!.id)).toBe(session!.user.id);
  // The other account keeps its link and its email; the new one got a placeholder instead of a duplicate address.
  const rows = await hubDb<{ id: number; tretu_sub: string | null; email: string | null }[]>`
    select id, tretu_sub, email from users where id in (${taken}, ${fresh!.id}) order by id`;
  expect(rows).toEqual([
    { id: taken, tretu_sub: otherSub, email: account.email },
    { id: fresh!.id, tretu_sub: account.sub, email: `tretu-${account.sub}@users.tretu.invalid` },
  ]);
});
