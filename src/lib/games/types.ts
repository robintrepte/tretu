export type LiveStatus = {
  infraStatus: "no_host" | "provisioning" | "running" | "deleting" | "error";
  gameStatus: "stopped" | "starting" | "running" | "stopping" | "error";
  playerCount: number | null;
  maxPlayers: number | null;
  version?: string | null;
  details?: Record<string, unknown>;
};

export type AdapterContext = {
  instanceId: number;
  host?: string;
  mountPath: string;
};

export interface GameAdapter {
  gameType: string;
  provisionRuntime(ctx: AdapterContext): Promise<void>;
  start(ctx: AdapterContext): Promise<void>;
  stop(ctx: AdapterContext): Promise<void>;
  restart(ctx: AdapterContext): Promise<void>;
  applyConfig(ctx: AdapterContext, configPatch: Record<string, unknown>): Promise<void>;
  updateVersion(ctx: AdapterContext, targetVersion: string): Promise<void>;
  syncMods(ctx: AdapterContext, modSpec: Record<string, unknown>): Promise<void>;
  fetchLiveStatus(ctx: AdapterContext): Promise<LiveStatus>;
  preSnapshotHook(ctx: AdapterContext): Promise<void>;
  postRestoreHook(ctx: AdapterContext): Promise<void>;
}
