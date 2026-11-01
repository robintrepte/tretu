"use client";

/** Small fetch wrapper for the session-authenticated /api/v1/me routes. */
export class MeApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string
  ) {
    super(message ?? code);
  }
}

export async function meApi<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api/v1/me${path}`, {
    method: init.method ?? "GET",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) throw new MeApiError(res.status, String(data.error ?? "error"), typeof data.message === "string" ? data.message : undefined);
  return data as T;
}
