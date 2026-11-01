export type MessageValues = Record<string, string | number>;

/**
 * An error whose user-facing text lives in the `api.errors` messages. `message` holds the key (for logs);
 * route handlers translate it into the visitor's language (`failFromError` in `@/lib/api/errors`).
 * Kept free of Next.js imports so workers and scripts can throw it too.
 */
export class LocalizedError extends Error {
  constructor(
    readonly key: string,
    readonly values: MessageValues = {},
    readonly status = 400
  ) {
    super(key);
    this.name = "LocalizedError";
  }
}
