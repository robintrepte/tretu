/**
 * Hetzner Cloud CPX RAM (GB) for server types used in the dashboard.
 * @see https://www.hetzner.com/cloud — Typen können sich ändern; bei neuen Slugs Fallback nutzen.
 */
const HETZNER_TYPE_RAM_GB: Record<string, number> = {
  cpx31: 8,
  cpx42: 16,
  cpx51: 32,
};

const DEFAULT_RAM_GB = 8;
/** Reserve for OS / page cache so the JVM does not take 100 % physikalischen RAM. */
export const JVM_OS_HEADROOM_GB = 1;

export function hetznerServerRamGb(serverType: string): number {
  const key = serverType.trim().toLowerCase();
  return HETZNER_TYPE_RAM_GB[key] ?? DEFAULT_RAM_GB;
}

/** JVM heap (-Xmx/-Xms) for a dedicated game host: fast alles vom VM-RAM, mit kleinem Systempuffer. */
export function jvmHeapGbForServerType(serverType: string): number {
  const total = hetznerServerRamGb(serverType);
  return Math.max(1, total - JVM_OS_HEADROOM_GB);
}
