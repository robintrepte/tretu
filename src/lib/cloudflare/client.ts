const BASE_URL = "https://api.cloudflare.com/client/v4";

type CfResponse<T> = { success: boolean; errors: Array<{ code: number; message: string }>; result: T };

async function cffetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await response.json().catch(() => null)) as CfResponse<T> | null;
  if (!response.ok || !body?.success) {
    const message = body?.errors?.map((e) => `${e.code}: ${e.message}`).join("; ") || `HTTP ${response.status}`;
    throw new Error(`Cloudflare API: ${message}`);
  }
  return body.result;
}

type DnsRecord = { id: string; name: string; type: string; content: string };

export const cloudflareClient = {
  /** Resolves the zone id for a domain; fails if the token cannot see the zone. */
  async findZoneId(token: string, domain: string): Promise<string> {
    const zones = await cffetch<Array<{ id: string; name: string }>>(token, `/zones?name=${encodeURIComponent(domain)}`);
    const zone = zones.find((z) => z.name === domain);
    if (!zone) {
      throw new Error(
        `Zone „${domain}“ nicht gefunden. Der Token braucht die Berechtigungen „Zone → Zone → Read“ und „Zone → DNS → Edit“ für diese Domain.`
      );
    }
    return zone.id;
  },

  async verifyDnsAccess(token: string, zoneId: string) {
    await cffetch<DnsRecord[]>(token, `/zones/${zoneId}/dns_records?per_page=1`);
  },

  /** Creates or updates an unproxied A record (game traffic cannot go through the Cloudflare proxy). */
  async upsertARecord(token: string, zoneId: string, fqdn: string, ip: string, knownRecordId?: string | null) {
    const payload = JSON.stringify({
      type: "A",
      name: fqdn,
      content: ip,
      ttl: 60,
      proxied: false,
      comment: "Verwaltet vom tretu Game-Server-Dashboard",
    });

    let recordId = knownRecordId ?? null;
    if (!recordId) {
      const existing = await cffetch<DnsRecord[]>(
        token,
        `/zones/${zoneId}/dns_records?type=A&name=${encodeURIComponent(fqdn)}`
      );
      recordId = existing[0]?.id ?? null;
    }

    if (recordId) {
      try {
        const updated = await cffetch<DnsRecord>(token, `/zones/${zoneId}/dns_records/${recordId}`, {
          method: "PUT",
          body: payload,
        });
        return updated.id;
      } catch {
        // Record was removed manually – create it again below.
      }
    }
    const created = await cffetch<DnsRecord>(token, `/zones/${zoneId}/dns_records`, { method: "POST", body: payload });
    return created.id;
  },

  async deleteRecord(token: string, zoneId: string, recordId: string) {
    try {
      await cffetch(token, `/zones/${zoneId}/dns_records/${recordId}`, { method: "DELETE" });
    } catch (error) {
      if (error instanceof Error && /81044|not found/i.test(error.message)) return;
      throw error;
    }
  },
};
