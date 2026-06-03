export type NavItem = {
  label: string;
  href: string;
  children?: { label: string; href: string }[];
};

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
  if (!options.includeMap) return [...NAV_WITHOUT_MAP];
  return [...NAV_WITHOUT_MAP, MAP_NAV_ITEM];
}
