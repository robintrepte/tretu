/**
 * Readable summary of auth's merge dry-run / result (`POST /api/v1/admin/merge`, built from
 * `lib/legacy/admin.ts` `planMerge` in auth: `{ from, into, move: {providers, gameLinks, passkeys, legacy},
 * drop: {providers, gameLinks} }`, possibly wrapped as `{ plan, … }`). Unknown shapes fall back to raw JSON.
 */
export type MergeSummary = {
  recognized: boolean;
  from: string | null;
  into: string | null;
  move: { providers: string[]; gameLinks: string[]; passkeys: number; legacy: string[] };
  drop: { providers: string[]; gameLinks: string[] };
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);

function label(item: unknown, keys: string[]): string | null {
  if (typeof item === "string") return item;
  if (!isObj(item)) return null;
  for (const key of keys) if (typeof item[key] === "string" && item[key]) return item[key] as string;
  return null;
}

function labels(list: unknown, keys: string[]): string[] {
  return Array.isArray(list) ? list.map((i) => label(i, keys)).filter((v): v is string => Boolean(v)) : [];
}

function legacyLabels(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((l) => {
      if (typeof l === "string") return l;
      if (!isObj(l)) return null;
      const name = (l.legacyUsername as string | undefined) || (l.legacyUserId as string | undefined);
      return l.app ? `${String(l.app)}: ${String(name ?? "")}` : name ?? null;
    })
    .filter((v): v is string => Boolean(v));
}

function who(value: unknown): string | null {
  if (typeof value === "string") return value;
  return label(value, ["username", "name", "email", "sub", "id"]);
}

export function summarizeMerge(raw: unknown): MergeSummary {
  const plan = isObj(raw) && isObj(raw.plan) ? raw.plan : isObj(raw) && isObj(raw.summary) ? raw.summary : raw;
  const move = isObj(plan) ? (isObj(plan.move) ? plan.move : isObj(plan.moved) ? plan.moved : null) : null;
  const drop = isObj(plan) ? (isObj(plan.drop) ? plan.drop : isObj(plan.dropped) ? plan.dropped : null) : null;
  const passkeys = move?.passkeys;
  return {
    recognized: Boolean(move),
    from: isObj(plan) ? who(plan.from) : null,
    into: isObj(plan) ? who(plan.into) : null,
    move: {
      providers: labels(move?.providers, ["providerId", "provider"]),
      gameLinks: labels(move?.gameLinks, ["provider", "providerId"]),
      passkeys: typeof passkeys === "number" ? passkeys : Array.isArray(passkeys) ? passkeys.length : 0,
      legacy: legacyLabels(move?.legacy),
    },
    drop: {
      providers: labels(drop?.providers, ["providerId", "provider"]),
      gameLinks: labels(drop?.gameLinks, ["provider", "providerId"]),
    },
  };
}
