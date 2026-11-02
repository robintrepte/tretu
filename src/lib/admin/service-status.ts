/**
 * Current state of the ecosystem's services for the admin overview, read from the status tables the platform
 * worker writes (the same data and cache as tretu.de/status, src/lib/status/read.ts; services are never called
 * on a request).
 */
import { getStatusOverview, type DisplayState, type StatusOverview } from "@/lib/status/read";

export type ServiceState = DisplayState;

export type ServiceStatus = {
  id: string;
  name: string;
  /** Public address (web services: their https origin; game servers: none). */
  url: string | null;
  state: ServiceState;
  checkedAt: string | null;
  /** Short note of the latest check, e.g. "87 ms" or "3/20 online". */
  detail: string | null;
};

export type ServiceStatusReport =
  | { available: false }
  | {
      available: true;
      services: ServiceStatus[];
      updatedAt: string | null;
      /** No check for a few minutes: the platform worker is probably not running. */
      stale: boolean;
    };

function detail(service: StatusOverview["services"][number]): string | null {
  if (service.state === "maintenance") return service.maintenance?.note ?? null;
  if (service.state === "unknown") return null;
  if (service.usersOnline !== null) return service.usersMax !== null ? `${service.usersOnline}/${service.usersMax} online` : `${service.usersOnline} online`;
  return service.responseMs !== null ? `${service.responseMs} ms` : null;
}

export function toServiceStatusReport(overview: StatusOverview): ServiceStatusReport {
  if (!overview.available) return { available: false };
  return {
    available: true,
    updatedAt: overview.updatedAt,
    stale: overview.stale,
    services: overview.services.map((s) => ({
      id: s.id,
      name: s.name,
      url: s.kind === "http" ? `https://${s.host}` : null,
      state: s.state,
      checkedAt: s.checkedAt,
      detail: detail(s),
    })),
  };
}

export async function getServiceStatuses(now: Date = new Date()): Promise<ServiceStatusReport> {
  return toServiceStatusReport(await getStatusOverview(now));
}
