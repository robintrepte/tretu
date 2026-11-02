/**
 * Current state of the ecosystem's services for the admin overview.
 *
 * The public status page (`/status`, its checks and tables) is a separate workstream; until its data is
 * available here this returns `{ available: false }` and the overview shows a placeholder. Replace
 * {@link getServiceStatuses} with a read of that data (same shape) once it is merged.
 */
export type ServiceState = "up" | "degraded" | "down" | "unknown";

export type ServiceStatus = {
  id: string;
  name: string;
  url: string | null;
  state: ServiceState;
  checkedAt: string | null;
  /** Short human-readable note (e.g. "HTTP 503"). */
  detail: string | null;
};

export type ServiceStatusReport = { available: false } | { available: true; services: ServiceStatus[]; updatedAt: string | null };

export async function getServiceStatuses(): Promise<ServiceStatusReport> {
  return { available: false };
}
