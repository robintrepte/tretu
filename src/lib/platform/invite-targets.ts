/** Where friends can be invited to from tretu.de (/freunde). */
export const INVITE_TARGETS = {
  play: { label: "Tretu Play", url: "https://play.tretu.de" },
  saga: { label: "Saga", url: "https://saga.tretu.de" },
  hollowmere: { label: "Hollowmere", url: "https://hollowmere.tretu.de" },
  minecraft: { label: "Minecraft", url: "https://mc.tretu.de" },
  teamspeak: { label: "TeamSpeak", url: "https://tretu.de/teamspeak" },
  discord: { label: "Discord", url: "https://tretu.de/discord" },
} as const;

export type InviteTarget = keyof typeof INVITE_TARGETS;
