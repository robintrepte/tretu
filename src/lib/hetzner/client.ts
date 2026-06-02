import { HETZNER_API_TOKEN } from "@/lib/env/server";

const baseUrl = "https://api.hetzner.cloud/v1";

async function hfetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${HETZNER_API_TOKEN}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`Hetzner API error (${response.status}): ${message}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

export type HetznerServerSummary = {
  id: number;
  name: string;
  status: string;
  public_net: {
    ipv4?: { ip: string };
  };
};

export type HetznerVolumeSummary = {
  id: number;
  name: string;
  location?: { name: string };
};

export const hetznerClient = {
  async deleteServer(serverId: string) {
    return hfetch(`/servers/${serverId}`, { method: "DELETE" });
  },

  async createSnapshot(serverId: string, description: string) {
    return hfetch<{ action: { id: number } }>(`/servers/${serverId}/actions/create_image`, {
      method: "POST",
      body: JSON.stringify({ type: "snapshot", description }),
    });
  },

  async createVolume(input: {
    name: string;
    sizeGb: number;
    location: string;
    labels?: Record<string, string>;
    format?: "xfs" | "ext4";
  }) {
    const body: Record<string, unknown> = {
      name: input.name,
      size: input.sizeGb,
      location: input.location,
      format: input.format ?? "ext4",
    };
    if (input.labels && Object.keys(input.labels).length > 0) {
      body.labels = input.labels;
    }
    return hfetch<{ volume: HetznerVolumeSummary }>(`/volumes`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async createServer(input: {
    name: string;
    serverType: string;
    image: string;
    location: string;
    volumeIds: number[];
    sshKeyIds: number[];
    startAfterCreate?: boolean;
  }) {
    const body: Record<string, unknown> = {
      name: input.name,
      server_type: input.serverType,
      image: input.image,
      start_after_create: input.startAfterCreate ?? true,
      location: input.location,
      public_net: { enable_ipv4: true },
    };
    if (input.volumeIds.length > 0) {
      body.volumes = input.volumeIds;
    }
    if (input.sshKeyIds.length > 0) {
      body.ssh_keys = input.sshKeyIds;
    }
    return hfetch<{ server: HetznerServerSummary }>(`/servers`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  },

  async getServer(serverId: string) {
    return hfetch<{ server: HetznerServerSummary }>(`/servers/${serverId}`);
  },

  async waitForServerRunning(serverId: string, opts?: { timeoutMs?: number; intervalMs?: number }) {
    const timeoutMs = opts?.timeoutMs ?? 180_000;
    const intervalMs = opts?.intervalMs ?? 2000;
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const { server } = await this.getServer(serverId);
      if (server.status === "running" && server.public_net?.ipv4?.ip) {
        return server;
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }

    throw new Error(`Timeout waiting for server ${serverId} to become running`);
  },
};
