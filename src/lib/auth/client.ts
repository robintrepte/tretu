"use client";

import { createAuthClient } from "better-auth/react";

/** Browser client for Better Auth (same origin, `/api/auth`). */
export const authClient = createAuthClient();
