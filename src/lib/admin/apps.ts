/**
 * The ecosystem's apps as the central admin shows them: each app keeps its own admin for app-specific things,
 * and the hub deep-links into it with a Tretu filter (central admin spec, "App admin deep links").
 */
export type EcosystemApp = {
  id: string;
  name: string;
  /** Public site. */
  url: string;
  /** The app's own admin, or null (Hollowmere has no web admin). */
  adminUrl: string | null;
  /** Deep link into the app's admin user list for one Tretu sub. */
  userAdminUrl: ((sub: string) => string) | null;
};

const q = (sub: string) => encodeURIComponent(sub);

export const ECOSYSTEM_APPS: readonly EcosystemApp[] = [
  {
    id: "saga",
    name: "Saga",
    url: "https://saga.tretu.de",
    adminUrl: "https://saga.tretu.de/admin",
    userAdminUrl: (sub) => `https://saga.tretu.de/admin/users?tretuSub=${q(sub)}`,
  },
  {
    id: "play",
    name: "Play",
    url: "https://play.tretu.de",
    adminUrl: "https://play.tretu.de/admin",
    userAdminUrl: (sub) => `https://play.tretu.de/admin/users?tretuSub=${q(sub)}`,
  },
  {
    id: "mc-dashboard",
    name: "Minecraft",
    url: "https://mc.tretu.de",
    adminUrl: "https://mc.tretu.de/admin",
    userAdminUrl: (sub) => `https://mc.tretu.de/admin?tretuSub=${q(sub)}`,
  },
  { id: "hollowmere", name: "Hollowmere", url: "https://hollowmere.tretu.de", adminUrl: null, userAdminUrl: null },
];

const BY_ID = new Map(ECOSYSTEM_APPS.map((a) => [a.id, a]));

export function ecosystemApp(id: string): EcosystemApp | null {
  return BY_ID.get(id) ?? null;
}

export function appName(id: string): string {
  return BY_ID.get(id)?.name ?? id;
}
