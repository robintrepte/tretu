/** Navigation entries; `labelKey` is a key in the `nav` message namespace. */
export type NavItem = {
  labelKey: string;
  href: string;
  children?: { labelKey: string; href: string }[];
  /** Opens another site in a new tab. */
  external?: boolean;
  /** Rendered as an accent-coloured pill to stand out in the menu. */
  highlight?: boolean;
};

export const PLAY_URL = "https://play.tretu.de";

export const PLAY_NAV_ITEM: NavItem = { labelKey: "play", href: PLAY_URL, external: true, highlight: true };

export const MAP_NAV_ITEM: NavItem = {
  labelKey: "map",
  href: "/map/",
};

const NAV_WITHOUT_MAP: NavItem[] = [
  { labelKey: "teamspeak", href: "/teamspeak/", children: [{ labelKey: "ranking", href: "/ranking/" }] },
  { labelKey: "discord", href: "/discord/" },
  { labelKey: "live", href: "/live/" },
  { labelKey: "videos", href: "/videos/" },
];

export function getNavItems(options: { includeMap: boolean }): NavItem[] {
  if (!options.includeMap) return [...NAV_WITHOUT_MAP, PLAY_NAV_ITEM];
  return [...NAV_WITHOUT_MAP, MAP_NAV_ITEM, PLAY_NAV_ITEM];
}
