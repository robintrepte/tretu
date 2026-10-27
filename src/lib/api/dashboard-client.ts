/**
 * Helpers for browser-side calls to `/api/internal/dashboard/*` (JSON `{ data }` / `{ error }`).
 */

export async function readDashboardJson(res: Response): Promise<Record<string, unknown>> {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

/** Human-readable message for a non-OK dashboard API response. */
export function dashboardApiErrorMessage(res: Response, body: Record<string, unknown>): string {
  if (res.status === 401) return "Nicht angemeldet – bitte neu einloggen.";
  if (res.status === 403) return "Keine Berechtigung für diese Aktion.";
  const err = typeof body.error === "string" ? body.error.trim() : "";
  if (err) return err;
  return `Anfrage fehlgeschlagen (${res.status}).`;
}

/** Calls a dashboard API route and returns `data`, throwing an Error with a readable message otherwise. */
export async function dashboardApi<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: "no-store",
    });
  } catch {
    throw new Error("Netzwerkfehler – bitte erneut versuchen.");
  }
  const body = await readDashboardJson(res);
  if (!res.ok) throw new Error(dashboardApiErrorMessage(res, body));
  return body.data as T;
}
