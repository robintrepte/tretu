/**
 * Shared SEO and LLM-indexing configuration.
 * Single source of truth for site identity and default metadata.
 */

export const SITE_URL = "https://tretu.de" as const;

export const SITE_NAME = "Tretu" as const;
export const SITE_NAME_FULL = "Tretu Gaming Community" as const;

export const DEFAULT_DESCRIPTION =
  "Willkommen auf der Webseite von Tretu! Unser Ziel ist es, das Community-Erlebnis auf ein neues Level zu bringen. Von Gamern, für Gamer. Teamspeak, Discord, Livestreams, Minecraft-Map und mehr.";

export const DEFAULT_OG_IMAGE = `${SITE_URL}/logo.svg`;

export const LOCALE = "de_DE" as const;
export const LANG = "de" as const;

/** Social / sameAs for Organization schema and footer */
export const SOCIAL_LINKS = [
  "https://www.facebook.com/TretuDE/",
  "https://www.youtube.com/c/Tretu",
  "https://www.twitch.tv/TretuDE",
] as const;

/** Keywords for meta and LLM context (German gaming community) */
export const DEFAULT_KEYWORDS = [
  "Tretu",
  "Gaming Community",
  "Teamspeak",
  "Discord",
  "Minecraft",
  "Livestream",
  "Twitch",
  "YouTube",
  "deutsche Community",
];
