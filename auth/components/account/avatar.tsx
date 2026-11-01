import { cn } from "@/lib/utils"

/** Profile picture or initials. Plain <img>: pictures come from this site or the sign-in providers' CDNs. */
export function Avatar({ name, image, size = 40, className }: { name: string; image: string | null; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element -- remote avatars of arbitrary hosts in the allow-list
    <img src={image} alt="" width={size} height={size} className={cn("shrink-0 rounded-full object-cover ring-1 ring-border", className)} style={{ width: size, height: size }} referrerPolicy="no-referrer" />
  ) : (
    <span
      aria-hidden
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-semibold text-white", className)}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </span>
  )
}
