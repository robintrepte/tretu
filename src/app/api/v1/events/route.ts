import { ingestEvents, parseEventBody } from "@/lib/platform/events";
import { PlatformError } from "@/lib/platform/errors";
import { json, signedRoute } from "@/lib/platform/http";

/** POST /api/v1/events — one envelope or {"events":[…]} (max 100) → 202 {accepted, duplicates}. */
export const POST = signedRoute(async (_req, { app, rawBody }) => {
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new PlatformError(400, "invalid_json", "Body is not valid JSON.");
  }
  const events = parseEventBody(body, app);
  return json(await ingestEvents(events), 202);
});
