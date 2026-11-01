/** Error with an HTTP status and a contract error code (`{"error":"<code>"}`). */
export class PlatformError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly extra: Record<string, unknown> = {}
  ) {
    super(message ?? code);
    this.name = "PlatformError";
  }
}

export const notFound = (what = "not_found", message?: string) => new PlatformError(404, what, message);
export const badRequest = (message?: string, code = "invalid_request") => new PlatformError(400, code, message);
export const forbidden = (code = "forbidden", message?: string) => new PlatformError(403, code, message);
export const conflict = (code = "conflict", message?: string) => new PlatformError(409, code, message);
