import { cn } from "@/lib/utils";

const SIZES = { sm: "size-10 text-sm", md: "size-14 text-lg", lg: "size-24 text-3xl md:size-28" } as const;

export function Avatar({
  name,
  src,
  size = "md",
  online,
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZES;
  online?: "online" | "playing" | null;
  className?: string;
}) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?";
  return (
    <span className={cn("relative inline-flex shrink-0", className)}>
      {src ? (
        // Avatars come from auth.tretu.de / Discord; plain <img> avoids next/image domain config.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className={cn("rounded-full object-cover ring-1 ring-border", SIZES[size])} referrerPolicy="no-referrer" />
      ) : (
        <span
          className={cn(
            "inline-flex items-center justify-center rounded-full bg-[var(--tretu-accent)]/15 font-semibold text-[var(--tretu-accent)] ring-1 ring-[var(--tretu-accent)]/25",
            SIZES[size]
          )}
          aria-hidden
        >
          {initials}
        </span>
      )}
      {online ? (
        <span
          className={cn(
            "absolute bottom-0 right-0 block rounded-full ring-2 ring-background",
            size === "lg" ? "size-5" : "size-3",
            online === "playing" ? "bg-[var(--tretu-accent)]" : "bg-emerald-500"
          )}
          aria-hidden
        />
      ) : null}
    </span>
  );
}
