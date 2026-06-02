type LogLevel = "info" | "warn" | "error";

export function log(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
  console[level](
    JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...meta,
    })
  );
}
