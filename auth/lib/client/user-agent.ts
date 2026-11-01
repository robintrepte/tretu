/** "Chrome · Windows"-style labels for sessions and the activity log. */
export function describeDevice(userAgent: string): string {
  const ua = userAgent
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : /Godot|Hollowmere/i.test(ua)
              ? "Hollowmere"
              : /node|undici|curl|okhttp/i.test(ua)
                ? "App"
                : "Browser"
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad|iOS/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X|Macintosh/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null
  return os ? `${browser} · ${os}` : browser
}
