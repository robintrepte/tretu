export type NavItem = {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
  /** Opens another site in a new tab. */
  external?: boolean;
  /** Rendered as an accent-coloured pill to stand out in the menu. */
  highlight?: boolean;
};

export const PLAY_URL = "https://play.tretu.de";

export const PLAY_NAV_ITEM: NavItem = { label: "Play", href: PLAY_URL, external: true, highlight: true };

export const MAP_NAV_ITEM: NavItem = {
  label: "Minecraft Map",
  href: "/map/",
};

const NAV_WITHOUT_MAP: NavItem[] = [
  { label: "Teamspeak", href: "/teamspeak/", children: [{ label: "Ranking & Stats", href: "/ranking/" }] },
  { label: "Discord", href: "/discord/" },
  { label: "Livestream", href: "/live/" },
  { label: "Videos", href: "/videos/" },
];

export function getNavItems(options: { includeMap: boolean }): NavItem[] {
  if (!options.includeMap) return [...NAV_WITHOUT_MAP, PLAY_NAV_ITEM];
  return [...NAV_WITHOUT_MAP, MAP_NAV_ITEM, PLAY_NAV_ITEM];
}
