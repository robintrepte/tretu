import type { GameAdapter } from "@/lib/games/types";
import { Arma2Adapter } from "@/lib/games/arma2.adapter";
import { Arma3Adapter } from "@/lib/games/arma3.adapter";
import { ArkAdapter } from "@/lib/games/ark.adapter";
import { Cs2Adapter } from "@/lib/games/cs2.adapter";
import { MinecraftAdapter } from "@/lib/games/minecraft.adapter";
import { SatisfactoryAdapter } from "@/lib/games/satisfactory.adapter";
import { SpaceEngineersAdapter } from "@/lib/games/spaceengineers.adapter";

const adapters: Record<string, GameAdapter> = {
  minecraft: new MinecraftAdapter(),
  cs2: new Cs2Adapter(),
  ark: new ArkAdapter(),
  satisfactory: new SatisfactoryAdapter(),
  spaceengineers: new SpaceEngineersAdapter(),
  arma3: new Arma3Adapter(),
  arma2: new Arma2Adapter(),
};

export function getGameAdapter(gameType: string): GameAdapter {
  const adapter = adapters[gameType];
  if (!adapter) throw new Error(`Unsupported game type: ${gameType}`);
  return adapter;
}
