import type { LevelInfo } from "@/lib/platform/levels";
import type { Translator } from "@/lib/platform/i18n-core";

export function LevelBar({ level, t }: { level: LevelInfo; t: Translator }) {
  const span = Math.max(1, level.xpNextLevel - level.xpLevelStart);
  const progress = Math.min(100, Math.max(0, ((level.xp - level.xpLevelStart) / span) * 100));
  return (
    <div className="w-full space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-[var(--tretu-accent)]">{t("common.level", { level: level.level })}</span>
        <span className="tabular-nums text-muted-foreground">
          {t("profile.xpProgress", { current: level.xp, next: level.xpNextLevel, level: level.level + 1 })}
        </span>
      </div>
      <div
        className="h-2.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={level.xpLevelStart}
        aria-valuemax={level.xpNextLevel}
        aria-valuenow={level.xp}
        aria-label={t("common.level", { level: level.level })}
      >
        <div className="h-full rounded-full bg-[var(--tretu-accent)] transition-[width]" style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}
