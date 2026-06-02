import { cn } from "@/lib/utils";
import { getGameArt } from "@/lib/games/art";

type GameThumbnailProps = {
  gameType: string;
  className?: string;
  /** Höhe / Auflösung der Fläche */
  size?: "sm" | "md" | "lg" | "banner";
};

const sizeClasses: Record<NonNullable<GameThumbnailProps["size"]>, string> = {
  sm: "min-h-16",
  md: "min-h-[7.25rem]",
  lg: "min-h-36",
  banner: "min-h-44 sm:min-h-52",
};

export function GameThumbnail({ gameType, className, size = "md" }: GameThumbnailProps) {
  const { Icon, gradient } = getGameArt(gameType);
  const iconScale =
    size === "banner" ? "h-16 w-16 sm:h-20 sm:w-20" : size === "lg" ? "h-14 w-14" : size === "md" ? "h-11 w-11" : "h-8 w-8";

  return (
    <div
      className={cn(
        "relative flex w-full items-center justify-center overflow-hidden bg-gradient-to-br",
        gradient,
        sizeClasses[size],
        className
      )}
      aria-hidden
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,rgba(255,255,255,0.22),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_top,rgba(0,0,0,0.35),transparent_40%)]"
        aria-hidden
      />
      <Icon className={cn("relative z-[1] text-white/95 drop-shadow-lg", iconScale)} strokeWidth={1.35} />
    </div>
  );
}
