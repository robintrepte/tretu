import Image from "next/image";
import {
  BarChart3,
  FileText,
  Map,
  Shield,
  MessageCircle,
} from "lucide-react";

export type PageIconName =
  | "teamspeak"
  | "discord"
  | "ranking"
  | "youtube"
  | "twitch"
  | "map"
  | "impressum"
  | "datenschutz";

/** Icon size classes per variant (slightly smaller, vert-centered with title) */
const iconSizeClass = {
  default: "h-12 w-12 shrink-0 md:h-14 md:w-14 lg:h-16 lg:w-16",
  hero: "h-14 w-14 shrink-0 md:h-20 md:w-20 lg:h-24 lg:w-24",
} as const;

function TeamspeakIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/teamspeak.svg"
      alt=""
      width={80}
      height={80}
      className={`shrink-0 invert dark:invert-0 ${className ?? ""}`}
    />
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <Image
      src="/discord.svg"
      alt=""
      width={80}
      height={80}
      className={`shrink-0 invert dark:invert-0 ${className ?? ""}`}
    />
  );
}

/** YouTube play icon (fa-youtube-play style) to match tretu.de/videos */
function YouTubePlayIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`shrink-0 ${className ?? ""}`}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
    >
      <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
    </svg>
  );
}

export type PageTitleVariant = "default" | "hero";

export function PageTitle({
  title,
  icon,
  variant = "default",
}: {
  title: string;
  icon?: PageIconName;
  variant?: PageTitleVariant;
}) {
  const iconClass = iconSizeClass[variant];
  const iconEl = icon != null ? (() => {
    switch (icon) {
      case "teamspeak":
        return <TeamspeakIcon className={iconClass} />;
      case "discord":
        return <DiscordIcon className={iconClass} />;
      case "ranking":
        return <BarChart3 className={iconClass} strokeWidth={1.5} />;
      case "youtube":
        return <YouTubePlayIcon className={iconClass} />;
      case "twitch":
        return (
          <svg
            className={iconClass}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden
          >
            <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
          </svg>
        );
      case "map":
        return <Map className={iconClass} strokeWidth={1.5} />;
      case "impressum":
        return <FileText className={iconClass} strokeWidth={1.5} />;
      case "datenschutz":
        return <Shield className={iconClass} strokeWidth={1.5} />;
      default:
        return <MessageCircle className={iconClass} strokeWidth={1.5} />;
    }
  })() : null;

  const isHero = variant === "hero";

  const wrapperClass = isHero
    ? "mb-0 flex flex-col items-center justify-center gap-5 py-4 text-center"
    : "mb-10 flex items-center gap-5 py-8 text-foreground";

  const h1Class = isHero
    ? "max-w-[720px] text-5xl font-bold leading-tight text-white drop-shadow-sm md:text-7xl lg:text-8xl"
    : "text-5xl font-semibold leading-tight tracking-tight md:text-6xl lg:text-7xl";

  const iconWrapClass = isHero
    ? "flex items-center text-white opacity-95 [&_svg]:text-white [&_svg]:shrink-0"
    : "flex items-center self-center text-foreground opacity-90 [&_svg]:text-foreground [&_svg]:shrink-0";

  return (
    <div className={wrapperClass}>
      {iconEl != null && <span className={iconWrapClass}>{iconEl}</span>}
      <h1 className={h1Class}>{title}</h1>
    </div>
  );
}
