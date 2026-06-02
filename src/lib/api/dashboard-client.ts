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
