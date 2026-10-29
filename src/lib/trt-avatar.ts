/**
 * TRT clan avatar: white TRT lettering with a soft glow on a colour gradient.
 * The lettering is a vector trace of the original clan logo, so exports stay sharp at any size.
 */

/** TRT lettering in its own coordinate space (bounding box below). */
export const TRT_LOGO_PATH = [
  "M74 316L402 316L496 400L328 400L328 767L240 767L240 400L74 400Z",
  "M440 316L572 316C665 316 697 360 697 455L697 495C697 570 660 612 594 615L548 616L714 767L590 767L431 616L361 616L361 544L583 544C600 543 610 530 610 505L610 455C610 415 600 401 572 400L533 400Z",
  "M662 316L1005 316L1005 400L840 400L840 767L752 767L752 400L720 400C716 365 698 330 662 316Z",
].join("");

const LOGO_BOX = { x: 74, y: 316, width: 931, height: 451 };

export type GradientDirection = "vertical" | "diagonal" | "horizontal" | "radial";

export type AvatarConfig = {
  /** 1–4 colour stops, top → bottom. */
  colors: string[];
  direction: GradientDirection;
  logoColor: string;
  /** 0 = off, 1 = like the original avatars. */
  glow: number;
  /** Logo width relative to the avatar (the originals use ~0.69). */
  logoScale: number;
};

export type AvatarPreset = { id: string; label: string; config: AvatarConfig };

const base = { direction: "vertical" as const, logoColor: "#ffffff", glow: 1, logoScale: 0.69 };

/** Colours sampled from the existing TRT avatars. */
export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "blue", label: "Blau", config: { ...base, colors: ["#1e8acb", "#0572b9", "#1f4192", "#2d2c7e"] } },
  { id: "red", label: "Rot", config: { ...base, colors: ["#e30613", "#9a2633"] } },
  { id: "orange", label: "Orange", config: { ...base, colors: ["#f39200", "#e94e1a"] } },
  { id: "yellow", label: "Gelb", config: { ...base, colors: ["#f8ea19", "#f39200"] } },
  { id: "lime", label: "Limette", config: { ...base, colors: ["#dddc00", "#3aaa35"] } },
  { id: "green", label: "Grün", config: { ...base, colors: ["#3aaa35", "#076633"] } },
  { id: "pink", label: "Pink", config: { ...base, colors: ["#e61873", "#9c2256"] } },
  { id: "purple", label: "Lila", config: { ...base, colors: ["#951b81", "#29235c"] } },
  { id: "dovah", label: "Dämmerung", config: { ...base, colors: ["#224b9b", "#a6529b"] } },
  { id: "bamboo", label: "Bambus", config: { ...base, colors: ["#1b9675", "#0f5040", "#030405"] } },
  { id: "brown", label: "Braun", config: { ...base, colors: ["#b07e4a", "#442a19"] } },
  { id: "beige", label: "Beige", config: { ...base, colors: ["#cbbb9f", "#c0927a"] } },
  { id: "black", label: "Schwarz", config: { ...base, colors: ["#3a3a3a", "#0b0b0b"] } },
  {
    id: "classic",
    label: "Klassik",
    config: { ...base, colors: ["#ffffff", "#bcbcbc"], logoColor: "#ed6f1a", glow: 0 },
  },
];

export const DEFAULT_AVATAR = AVATAR_PRESETS[0].config;

const HEX = /^#[0-9a-f]{6}$/i;

export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

function gradientDef(config: AvatarConfig): string {
  const stops = config.colors
    .map((c, i) => `<stop offset="${config.colors.length === 1 ? 0 : i / (config.colors.length - 1)}" stop-color="${c}"/>`)
    .join("");
  if (config.direction === "radial") {
    return `<radialGradient id="bg" cx="0.5" cy="0.5" r="0.75">${stops}</radialGradient>`;
  }
  const end = { vertical: [0, 1], diagonal: [1, 1], horizontal: [1, 0] }[config.direction];
  return `<linearGradient id="bg" x1="0" y1="0" x2="${end[0]}" y2="${end[1]}">${stops}</linearGradient>`;
}

/** Relative luminance (0–1) of a hex colour. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Self-contained SVG markup of the avatar at the given pixel size. */
export function buildAvatarSvg(config: AvatarConfig, size = 1080): string {
  const scale = (size * config.logoScale) / LOGO_BOX.width;
  const tx = size / 2 - (LOGO_BOX.x + LOGO_BOX.width / 2) * scale;
  const ty = size / 2 - (LOGO_BOX.y + LOGO_BOX.height / 2) * scale;
  const glowRadius = 9 * config.glow / scale;
  // Light logos glow white like the originals; dark logos get a soft drop shadow instead.
  const lightLogo = luminance(config.logoColor) > 0.5;

  const filter =
    config.glow > 0
      ? lightLogo
        ? `<filter id="glow" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="${glowRadius.toFixed(2)}" result="blur"/><feFlood flood-color="${config.logoColor}" flood-opacity="${Math.min(0.85 * config.glow, 1).toFixed(2)}"/><feComposite in2="blur" operator="in" result="halo"/><feMerge><feMergeNode in="halo"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`
        : `<filter id="glow" x="-20%" y="-30%" width="140%" height="160%"><feDropShadow dx="${(4 / scale).toFixed(2)}" dy="${(6 / scale).toFixed(2)}" stdDeviation="${glowRadius.toFixed(2)}" flood-color="#000000" flood-opacity="${(0.35 * config.glow).toFixed(2)}"/></filter>`
      : "";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`,
    `<defs>${gradientDef(config)}${filter}</defs>`,
    `<rect width="${size}" height="${size}" fill="url(#bg)"/>`,
    `<g transform="translate(${tx.toFixed(3)} ${ty.toFixed(3)}) scale(${scale.toFixed(5)})">`,
    `<path d="${TRT_LOGO_PATH}" fill="${config.logoColor}"${config.glow > 0 ? ' filter="url(#glow)"' : ""}/>`,
    "</g></svg>",
  ].join("");
}

/** Serialises a config for share links (`?c=1e8acb-0572b9&d=vertical…`). */
export function configToParams(config: AvatarConfig): URLSearchParams {
  return new URLSearchParams({
    c: config.colors.map((c) => c.slice(1)).join("-"),
    d: config.direction,
    l: config.logoColor.slice(1),
    g: String(config.glow),
    s: String(config.logoScale),
  });
}

export function configFromParams(params: URLSearchParams): AvatarConfig | null {
  const colors = (params.get("c") ?? "")
    .split("-")
    .map((c) => `#${c}`)
    .filter(isHexColor);
  if (colors.length < 1 || colors.length > 4) return null;
  const direction = params.get("d") as GradientDirection;
  const logoColor = `#${params.get("l") ?? "ffffff"}`;
  const glow = Number(params.get("g") ?? 1);
  const logoScale = Number(params.get("s") ?? 0.69);
  return {
    colors,
    direction: ["vertical", "diagonal", "horizontal", "radial"].includes(direction) ? direction : "vertical",
    logoColor: isHexColor(logoColor) ? logoColor : "#ffffff",
    glow: Number.isFinite(glow) ? Math.min(Math.max(glow, 0), 2) : 1,
    logoScale: Number.isFinite(logoScale) ? Math.min(Math.max(logoScale, 0.3), 0.95) : 0.69,
  };
}

/** Random but pleasant two-colour gradient (neighbouring hues, darker at the bottom). */
export function randomAvatarConfig(previous?: AvatarConfig): AvatarConfig {
  const hue = Math.floor(Math.random() * 360);
  const shift = 20 + Math.floor(Math.random() * 50) * (Math.random() < 0.5 ? -1 : 1);
  const top = hslToHex(hue, 70 + Math.random() * 25, 45 + Math.random() * 15);
  const bottom = hslToHex((hue + shift + 360) % 360, 60 + Math.random() * 30, 22 + Math.random() * 15);
  return { ...(previous ?? DEFAULT_AVATAR), colors: [top, bottom], logoColor: "#ffffff", glow: previous?.glow || 1 };
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n: number) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}
