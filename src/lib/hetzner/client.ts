import { getHetznerToken } from "@/lib/settings/store";

const BASE_URL = "https://api.hetzner.cloud/v1";

export class HetznerApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "HetznerApiError";
  }
}

async function hfetch<T>(path: string, init?: RequestInit & { token?: string }): Promise<T> {
  const token = init?.token ?? getHetznerToken();
  if (!token) throw new Error("Hetzner ist noch nicht verbunden – bitte im Dashboard unter „Einrichtung“ den API-Token hinterlegen.");

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    let code = "unknown";
    let message = text.slice(0, 500);
    try {
      const body = JSON.parse(text) as { error?: { code?: string; message?: string } };
      code = body.error?.code ?? code;
      message = body.error?.message ?? message;
    } catch {
      // keep raw text
    }
    throw new HetznerApiError(response.status, code, `Hetzner API (${response.status} ${code}): ${message}`);
  }

  return (text ? JSON.parse(text) : undefined) as T;
}

export type HetznerAction = {
  id: number;
  command: string;
  status: "running" | "success" | "error";
  progress: number;
  error: { code: string; message: string } | null;
};

export type HetznerServer = {
  id: number;
  name: string;
  status: string;
  public_net: { ipv4: { ip: string } | null; ipv6: { ip: string } | null };
  server_type: { name: string; memory: number; cores: number };
  datacenter: { location: { name: string } };
  volumes: number[];
};

export type HetznerVolume = {
  id: number;
  name: string;
  size: number;
  server: number | null;
  linux_device: string;
  location: { name: string };
  status: string;
};

type Price = { location: string; price_hourly: { gross: string }; price_monthly: { gross: string } };

export type HetznerServerType = {
  id: number;
  name: string;
  description: string;
  cores: number;
  memory: number;
  disk: number;
  cpu_type: "shared" | "dedicated";
  architecture: "x86" | "arm";
  deprecated?: boolean | null;
  deprecation: { announced: string; unavailable_after: string } | null;
  prices: Price[];
};

export type HetznerLocation = {
  id: number;
  name: string;
  description: string;
  country: string;
  city: string;
  network_zone: string;
};

type HetznerDatacenter = {
  location: { name: string };
  server_types: { available: number[]; supported: number[] };
};

export type FirewallRule = {
  direction: "in";
  protocol: "tcp" | "udp" | "icmp";
  port?: string;
  source_ips: string[];
  description?: string;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const hetznerClient = {
  /** Validates a token by listing locations (works for read and read/write tokens). */
  async verifyToken(token: string) {
    await hfetch<{ locations: HetznerLocation[] }>("/locations", { token });
    // A read-only token would fail on writes later; the SSH key upload during setup proves write access.
  },

  async listLocations() {
    const { locations } = await hfetch<{ locations: HetznerLocation[] }>("/locations");
    return locations;
  },

  async listServerTypes() {
    const { server_types } = await hfetch<{ server_types: HetznerServerType[] }>("/server_types?per_page=50");
    return server_types;
  },

  /** Server type ids that can currently be ordered, per location. */
  async availableServerTypesByLocation(): Promise<Record<string, number[]>> {
    const { datacenters } = await hfetch<{ datacenters: HetznerDatacenter[] }>("/datacenters");
    const result: Record<string, Set<number>> = {};
    for (const dc of datacenters) {
      const set = (result[dc.location.name] ??= new Set());
      for (const id of dc.server_types.available) set.add(id);
    }
    return Object.fromEntries(Object.entries(result).map(([k, v]) => [k, [...v]]));
  },

  async volumePricePerGbMonth(): Promise<number | null> {
    const { pricing } = await hfetch<{ pricing: { volume?: { price_per_gb_month?: { gross: string } } } }>("/pricing");
    const gross = Number(pricing.volume?.price_per_gb_month?.gross);
    return Number.isFinite(gross) ? gross : null;
  },

  async getAction(actionId: number) {
    const { action } = await hfetch<{ action: HetznerAction }>(`/actions/${actionId}`);
    return action;
  },

  async waitForAction(actionId: number, timeoutMs = 300_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const action = await this.getAction(actionId);
      if (action.status === "success") return action;
      if (action.status === "error") {
        throw new Error(`Hetzner-Aktion ${action.command} fehlgeschlagen: ${action.error?.message ?? "unbekannt"}`);
      }
      await sleep(2000);
    }
    throw new Error(`Zeitüberschreitung bei Hetzner-Aktion ${actionId}`);
  },

  async createSshKey(name: string, publicKey: string, token?: string) {
    const { ssh_key } = await hfetch<{ ssh_key: { id: number } }>("/ssh_keys", {
      method: "POST",
      token,
      body: JSON.stringify({ name, public_key: publicKey, labels: { managed_by: "tretu" } }),
    });
    return ssh_key;
  },

  async findSshKeyByFingerprint(fingerprint: string, token?: string) {
    const { ssh_keys } = await hfetch<{ ssh_keys: Array<{ id: number }> }>(
      `/ssh_keys?fingerprint=${encodeURIComponent(fingerprint)}`,
      { token }
    );
    return ssh_keys[0] ?? null;
  },

  async createVolume(input: { name: string; sizeGb: number; location: string; labels: Record<string, string> }) {
    const res = await hfetch<{ volume: HetznerVolume; action: HetznerAction | null }>("/volumes", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        size: input.sizeGb,
        location: input.location,
        format: "ext4",
        labels: input.labels,
      }),
    });
    if (res.action) await this.waitForAction(res.action.id);
    return res.volume;
  },

  async getVolume(volumeId: string) {
    const { volume } = await hfetch<{ volume: HetznerVolume }>(`/volumes/${volumeId}`);
    return volume;
  },

  async resizeVolume(volumeId: string, sizeGb: number) {
    const { action } = await hfetch<{ action: HetznerAction }>(`/volumes/${volumeId}/actions/resize`, {
      method: "POST",
      body: JSON.stringify({ size: sizeGb }),
    });
    await this.waitForAction(action.id);
  },

  async detachVolume(volumeId: string) {
    const { action } = await hfetch<{ action: HetznerAction }>(`/volumes/${volumeId}/actions/detach`, {
      method: "POST",
    });
    await this.waitForAction(action.id);
  },

  async deleteVolume(volumeId: string) {
    await hfetch(`/volumes/${volumeId}`, { method: "DELETE" });
  },

  async createFirewall(name: string, rules: FirewallRule[], labels: Record<string, string>) {
    const { firewall } = await hfetch<{ firewall: { id: number } }>("/firewalls", {
      method: "POST",
      body: JSON.stringify({ name, rules, labels }),
    });
    return firewall;
  },

  async setFirewallRules(firewallId: string, rules: FirewallRule[]) {
    const { actions } = await hfetch<{ actions: HetznerAction[] }>(`/firewalls/${firewallId}/actions/set_rules`, {
      method: "POST",
      body: JSON.stringify({ rules }),
    });
    for (const action of actions) await this.waitForAction(action.id);
  },

  async deleteFirewall(firewallId: string) {
    await hfetch(`/firewalls/${firewallId}`, { method: "DELETE" });
  },

  async createServer(input: {
    name: string;
    serverType: string;
    image: string;
    location: string;
    volumeIds: number[];
    sshKeyIds: number[];
    firewallIds: number[];
    labels: Record<string, string>;
  }) {
    return hfetch<{ server: HetznerServer; action: HetznerAction }>("/servers", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        server_type: input.serverType,
        image: input.image,
        location: input.location,
        start_after_create: true,
        public_net: { enable_ipv4: true, enable_ipv6: true },
        volumes: input.volumeIds,
        automount: false,
        ssh_keys: input.sshKeyIds,
        firewalls: input.firewallIds.map((firewall) => ({ firewall })),
        labels: input.labels,
      }),
    });
  },

  /** Returns null when the server no longer exists. */
  async getServer(serverId: string) {
    try {
      const { server } = await hfetch<{ server: HetznerServer }>(`/servers/${serverId}`);
      return server;
    } catch (error) {
      if (error instanceof HetznerApiError && error.status === 404) return null;
      throw error;
    }
  },

  async deleteServer(serverId: string) {
    try {
      const { action } = await hfetch<{ action: HetznerAction }>(`/servers/${serverId}`, { method: "DELETE" });
      await this.waitForAction(action.id);
    } catch (error) {
      if (error instanceof HetznerApiError && error.status === 404) return;
      throw error;
    }
  },

  async powerOn(serverId: string) {
    const { action } = await hfetch<{ action: HetznerAction }>(`/servers/${serverId}/actions/poweron`, {
      method: "POST",
    });
    await this.waitForAction(action.id);
  },

  async waitForServerRunning(serverId: string, timeoutMs = 300_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const server = await this.getServer(serverId);
      if (server?.status === "running" && server.public_net?.ipv4?.ip) return server;
      await sleep(2500);
    }
    throw new Error(`Hetzner-Server ${serverId} ist nach ${Math.round(timeoutMs / 1000)}s nicht gestartet.`);
  },
};
