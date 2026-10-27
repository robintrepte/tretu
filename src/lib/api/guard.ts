import type { NextResponse } from "next/server";

import { fail } from "@/lib/api/respond";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";
import type { Permission } from "@/lib/permissions/types";

type Guarded = { userId: number; error?: never } | { userId?: never; error: NextResponse };

/** Resolves the signed-in user and checks a permission; returns an error response otherwise. */
export async function requirePermission(permission: Permission): Promise<Guarded> {
  const userId = await getUserId();
  if (!userId) return { error: fail("Nicht angemeldet.", 401) };
  if (!hasPermission(userId, permission)) return { error: fail("Keine Berechtigung für diese Aktion.", 403) };
  const numeric = Number(userId);
  if (!Number.isFinite(numeric)) return { error: fail("Nicht angemeldet.", 401) };
  return { userId: numeric };
}

export function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
}
