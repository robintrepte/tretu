import type { AdapterContext, GameAdapter, LiveStatus } from "@/lib/games/types";

export class BaseAdapter implements GameAdapter {
  gameType = "base";

  async provisionRuntime(ctx: AdapterContext): Promise<void> {
    void ctx;
  }
  async start(ctx: AdapterContext): Promise<void> {
    void ctx;
  }
  async stop(ctx: AdapterContext): Promise<void> {
    void ctx;
  }
  async restart(ctx: AdapterContext): Promise<void> {
    await this.stop(ctx);
    await this.start(ctx);
  }
  async applyConfig(ctx: AdapterContext, configPatch: Record<string, unknown>): Promise<void> {
    void ctx;
    void configPatch;
  }
  async updateVersion(ctx: AdapterContext, targetVersion: string): Promise<void> {
    void ctx;
    void targetVersion;
  }
  async syncMods(ctx: AdapterContext, modSpec: Record<string, unknown>): Promise<void> {
    void ctx;
    void modSpec;
  }
  async fetchLiveStatus(ctx: AdapterContext): Promise<LiveStatus> {
    void ctx;
    return {
      infraStatus: "running",
      gameStatus: "stopped",
      playerCount: null,
      maxPlayers: null,
    };
  }
  async preSnapshotHook(ctx: AdapterContext): Promise<void> {
    void ctx;
  }
  async postRestoreHook(ctx: AdapterContext): Promise<void> {
    void ctx;
  }
}
