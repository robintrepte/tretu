import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth/auth";
import { TRETU_CALLBACK_PATH } from "@/lib/auth/config";

const handler = toNextJsHandler(auth);

/**
 * auth.tretu.de redirects to `/api/auth/oauth2/callback/tretu` (contract §2); Better Auth 1.7 serves
 * generic OAuth providers at `/api/auth/callback/<id>`, so that path is forwarded internally.
 */
function forwardContractCallback(request: Request): Request {
  const url = new URL(request.url);
  if (url.pathname.replace(/\/+$/, "") !== TRETU_CALLBACK_PATH) return request;
  url.pathname = "/api/auth/callback/tretu";
  return new Request(url, request);
}

export async function GET(request: Request) {
  return handler.GET(forwardContractCallback(request));
}

export async function POST(request: Request) {
  return handler.POST(request);
}
