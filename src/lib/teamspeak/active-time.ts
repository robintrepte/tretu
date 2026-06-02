export type TsRankActivityConfig = {
  /** Count time while idle ≤ this many seconds (default 5 min). */
  idleGraceSec: number;
  /** Channel name substrings; match is case-insensitive (e.g. "afk"). */
  afkChannelMatchers: string[];
};

export function parseAfkChannelMatchers(raw: string | undefined): string[] {
  const defaults = ["afk"];
  if (!raw?.trim()) return defaults;
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return parsed.length ? parsed : defaults;
}

export function isAfkChannelName(channelName: string, matchers: string[]): boolean {
  const normalized = channelName.toLowerCase();
  return matchers.some((matcher) => normalized.includes(matcher));
}

export type ActivityCredit = {
  activeSeconds: number;
  idleSeconds: number;
  excludedAfk: boolean;
};

/**
 * Decide how much of a poll interval counts toward rank time.
 * - AFK channels: no credit
 * - Idle longer than grace: idle only (no rank)
 * - Otherwise: full interval as active
 */
export function computeActivityCredit(
  pollIntervalSec: number,
  clientIdleTimeMs: number,
  channelName: string | null,
  config: TsRankActivityConfig
): ActivityCredit {
  if (channelName && isAfkChannelName(channelName, config.afkChannelMatchers)) {
    return { activeSeconds: 0, idleSeconds: 0, excludedAfk: true };
  }

  const idleSec = Math.max(0, clientIdleTimeMs / 1000);
  if (idleSec > config.idleGraceSec) {
    return { activeSeconds: 0, idleSeconds: pollIntervalSec, excludedAfk: false };
  }

  return { activeSeconds: pollIntervalSec, idleSeconds: 0, excludedAfk: false };
}

export function isActiveForSnapshot(credit: ActivityCredit): boolean {
  return credit.activeSeconds > 0;
}
