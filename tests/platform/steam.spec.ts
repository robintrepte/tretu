/** Steam: `links.steam` from auth's user events → directory → linked-Steam badge on the profile (privacy respected). */
import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";

import { eq } from "drizzle-orm";

import { closeDatabase, ctx, envelope, resetDatabase, signedRequest, uuid } from "./helpers";
import { POST as postEvents } from "../../src/app/api/v1/events/route";
import { platformUsers } from "../../src/db/platform-schema";
import { platformDb } from "../../src/lib/platform/db";
import { validSteamId } from "../../src/lib/platform/directory";
import { acceptFriendRequest, sendFriendRequest } from "../../src/lib/platform/friends";
import { loadProfilePage, setVisibility } from "../../src/lib/platform/profile";

beforeEach(resetDatabase);
after(closeDatabase);

const STEAM = "76561197960287930";

async function send(body: unknown) {
  const res = await postEvents(await signedRequest("auth", "POST", "/api/v1/events", body), ctx());
  assert.equal(res.status, 202);
}

async function directory(sub: string) {
  const [row] = await platformDb.select().from(platformUsers).where(eq(platformUsers.sub, sub));
  return row;
}

test("validSteamId accepts individual SteamID64s only", () => {
  assert.equal(validSteamId(STEAM), STEAM);
  assert.equal(validSteamId("76561202255233023"), "76561202255233023", "highest account id");
  assert.equal(validSteamId("76561197960265728"), null, "account id 0");
  assert.equal(validSteamId("76561202255233024"), null, "beyond 32-bit account ids");
  assert.equal(validSteamId("STEAM_0:1:11101"), null);
  assert.equal(validSteamId("7656119796028793"), null, "16 digits");
  assert.equal(validSteamId("javascript:alert(1)"), null);
  assert.equal(validSteamId(undefined), null);
});

test("user.created / user.updated store links.steam; unlinking clears it", async () => {
  const sub = uuid();
  const t0 = Date.now() - 60_000;
  await send(envelope("auth", sub, "user.created", { username: "gabe", name: "Gabe", links: { steam: STEAM } }, new Date(t0)));
  let row = await directory(sub);
  assert.equal(row.steamId, STEAM);
  assert.equal(row.links.steam, STEAM);

  await send(envelope("auth", sub, "user.updated", { username: "gabe", name: "Gabe", links: { discord: "42" } }, new Date(t0 + 1000)));
  row = await directory(sub);
  assert.equal(row.steamId, null);
  assert.equal(row.links.steam, undefined);

  // An invalid value is kept out of the steam_id column (and never rendered as a link).
  await send(envelope("auth", sub, "user.updated", { username: "gabe", links: { steam: "not-a-steam-id" } }, new Date(t0 + 2000)));
  assert.equal((await directory(sub)).steamId, null);
});

test("profile page shows the Steam link only where the profile may be seen", async () => {
  const owner = uuid();
  const friend = uuid();
  const stranger = uuid();
  await send(envelope("auth", owner, "user.created", { username: "steamy", name: "Steamy", links: { steam: STEAM } }));
  await send(envelope("auth", friend, "user.created", { username: "buddy", name: "Buddy" }));
  await send(envelope("auth", stranger, "user.created", { username: "nobody", name: "Nobody" }));
  const request = await sendFriendRequest(platformDb, friend, owner);
  await acceptFriendRequest(platformDb, request.id, owner);

  const url = `https://steamcommunity.com/profiles/${STEAM}`;
  const view = async (viewer: string | null) => loadProfilePage(platformDb, "steamy", viewer, "de");

  const anonymous = await view(null);
  assert.equal(anonymous.state, "ok");
  assert.equal(anonymous.state === "ok" && anonymous.steamUrl, url);

  await setVisibility(platformDb, owner, "friends");
  const hidden = await view(stranger);
  assert.equal(hidden.state, "restricted");
  assert.ok(!("steamUrl" in hidden), "restricted pages carry no Steam link");
  const forFriend = await view(friend);
  assert.equal(forFriend.state === "ok" && forFriend.steamUrl, url);

  await setVisibility(platformDb, owner, "private");
  assert.equal((await view(friend)).state, "restricted");
  const own = await view(owner);
  assert.equal(own.state === "ok" && own.steamUrl, url);

  const noSteam = await loadProfilePage(platformDb, "buddy", null, "de");
  assert.equal(noSteam.state === "ok" && noSteam.steamUrl, null);
});
