import { describe, expect, it } from "vitest"
import { legacyConnection } from "@/lib/legacy/sources"

describe("legacy database URLs", () => {
  it("removes Prisma-only parameters that postgres.js would send as server settings", () => {
    const { url, searchPath } = legacyConnection(
      "postgresql://saga:pw@localhost:5432/saga?schema=public&connection_limit=5&pgbouncer=true&pool_timeout=10&sslmode=require",
    )
    const parsed = new URL(url)
    expect(parsed.searchParams.has("schema")).toBe(false)
    expect(parsed.searchParams.has("connection_limit")).toBe(false)
    expect(parsed.searchParams.has("pgbouncer")).toBe(false)
    expect(parsed.searchParams.has("pool_timeout")).toBe(false)
    expect(parsed.searchParams.get("sslmode")).toBe("require")
    expect(parsed.username).toBe("saga")
    expect(parsed.password).toBe("pw")
    expect(parsed.pathname).toBe("/saga")
    expect(searchPath).toBeNull()
  })

  it("turns a non-public Prisma schema into the search_path", () => {
    expect(legacyConnection("postgres://u@h/db?schema=saga_app").searchPath).toBe("saga_app")
    expect(legacyConnection("postgres://u@h/db?schema=bad;drop").searchPath).toBeNull()
  })

  it("leaves plain URLs and unparsable values alone", () => {
    expect(legacyConnection("postgres://u@h:5432/db")).toEqual({ url: "postgres://u@h:5432/db", searchPath: null })
    expect(legacyConnection("not a url")).toEqual({ url: "not a url", searchPath: null })
  })
})
