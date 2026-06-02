import type { LucideIcon } from "lucide-react";
import {
  Blocks,
  Crosshair,
  Factory,
  Gamepad2,
  Headphones,
  Mountain,
  Rocket,
  Shield,
  Swords,
} from "lucide-react";

export type GameArt = {
  Icon: LucideIcon;
  /** Tailwind gradient directions + stops (prefix with bg-gradient-to-br). */
  gradient: string;
  label: string;
};

const DEFAULT: GameArt = {
  Icon: Gamepad2,
  gradient: "from-slate-600 via-slate-700 to-zinc-900",
  label: "Spiel",
};

/** Visual + Anzeigename pro `game_instances.game_type`. */
const ART: Record<string, GameArt> = {
  minecraft: {
    Icon: Blocks,
    gradient: "from-emerald-800 via-green-700 to-lime-950",
    label: "Minecraft",
  },
  ark: {
    Icon: Mountain,
    gradient: "from-amber-800 via-orange-700 to-stone-900",
    label: "ARK: Survival Evolved",
  },
  satisfactory: {
    Icon: Factory,
    gradient: "from-orange-700 via-amber-600 to-yellow-950",
    label: "Satisfactory",
  },
  spaceengineers: {
    Icon: Rocket,
    gradient: "from-sky-800 via-blue-900 to-slate-950",
    label: "Space Engineers",
  },
  cs2: {
    Icon: Crosshair,
    gradient: "from-orange-600 via-amber-900 to-zinc-950",
    label: "Counter-Strike 2",
  },
  arma3: {
    Icon: Shield,
    gradient: "from-lime-900 via-green-900 to-stone-950",
    label: "ArmA 3",
  },
  arma2: {
    Icon: Swords,
    gradient: "from-stone-700 via-zinc-800 to-zinc-950",
    label: "ArmA 2",
  },
  teamspeak: {
    Icon: Headphones,
    gradient: "from-cyan-700 via-teal-800 to-slate-900",
    label: "TeamSpeak",
  },
};

export function getGameArt(gameType: string): GameArt {
  const key = gameType.trim().toLowerCase();
  return ART[key] ?? { ...DEFAULT, label: capitalizeFallback(gameType) };
}

function capitalizeFallback(raw: string): string {
  if (!raw.trim()) return DEFAULT.label;
  return raw.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
