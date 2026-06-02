import { readFileSync } from "node:fs";

import { normalizeTsUuid } from "@/lib/teamspeak/query-escape";
import { parseRankupDefinition } from "@/lib/teamspeak/rank-definition";

export type ParsedGroup = {
  sgid: number;
  name: string;
};

export type ParsedTsUser = {
  uuid: string;
  clientDbId: number;
  nickname: string;
  totalOnlineSeconds: number;
  lastSeenAt: Date;
  firstConnectedAt: Date | null;
  excepted: boolean;
  assignedServerGroupId: number | null;
};

export type ParsedStatsUser = {
  uuid: string;
  periodOnlineSeconds: number;
  periodIdleSeconds: number;
  removed: boolean;
};

export type ParsedRanksystemDump = {
  rankupDefinition: string;
  tiers: ReturnType<typeof parseRankupDefinition>;
  groups: Map<number, string>;
  users: ParsedTsUser[];
  statsByUuid: Map<string, ParsedStatsUser>;
};

function extractInsertValues(sql: string, table: string): string | null {
  const marker = `INSERT INTO \`${table}\` VALUES `;
  const idx = sql.indexOf(marker);
  if (idx < 0) return null;
  const start = idx + marker.length;
  const end = sql.indexOf(";\n", start);
  const endAlt = sql.indexOf(";", start);
  const stop = end >= 0 ? end : endAlt;
  if (stop < 0) return null;
  return sql.slice(start, stop);
}

function splitSqlTuples(valuesBlob: string): string[] {
  const tuples: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escape = false;

  for (let i = 0; i < valuesBlob.length; i++) {
    const ch = valuesBlob[i];

    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === "'") {
        inString = false;
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      continue;
    }

    if (ch === "(") {
      if (depth === 0) start = i + 1;
      depth++;
      continue;
    }

    if (ch === ")") {
      depth--;
      if (depth === 0 && start >= 0) {
        tuples.push(valuesBlob.slice(start, i));
        start = -1;
      }
    }
  }

  return tuples;
}

function splitFields(tuple: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inString = false;
  let escape = false;

  for (let i = 0; i < tuple.length; i++) {
    const ch = tuple[i];

    if (inString) {
      current += ch;
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        current = current.slice(0, -1);
        continue;
      }
      if (ch === "'") {
        inString = false;
        current = current.slice(0, -1);
      }
      continue;
    }

    if (ch === "'") {
      inString = true;
      continue;
    }

    if (ch === ",") {
      fields.push(current.trim());
      current = "";
      continue;
    }

    current += ch;
  }

  if (current.length) fields.push(current.trim());
  return fields;
}

function unquote(field: string): string {
  if (field === "NULL") return "";
  return field;
}

function parseNumber(field: string): number {
  const n = Number(unquote(field));
  return Number.isFinite(n) ? n : 0;
}

function parseCfgParams(valuesBlob: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const tuple of splitSqlTuples(valuesBlob)) {
    const [param, value] = splitFields(tuple);
    map.set(unquote(param), unquote(value));
  }
  return map;
}

function parseGroups(valuesBlob: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const tuple of splitSqlTuples(valuesBlob)) {
    const fields = splitFields(tuple);
    const sgid = parseNumber(fields[0] ?? "0");
    const name = unquote(fields[1] ?? "");
    if (Number.isFinite(sgid)) map.set(sgid, name);
  }
  return map;
}

function parseUsers(valuesBlob: string): ParsedTsUser[] {
  const users: ParsedTsUser[] = [];

  for (const tuple of splitSqlTuples(valuesBlob)) {
    const f = splitFields(tuple);
    const uuid = normalizeTsUuid(unquote(f[0] ?? ""));
    if (!uuid) continue;

    const lastSeenSec = parseNumber(f[4] ?? "0");
    const firstConSec = parseNumber(f[15] ?? "0");

    users.push({
      uuid,
      clientDbId: parseNumber(f[1] ?? "0"),
      nickname: unquote(f[3] ?? "Unknown"),
      totalOnlineSeconds: Math.round(parseNumber(f[2] ?? "0")),
      lastSeenAt: new Date(lastSeenSec * 1000),
      firstConnectedAt: firstConSec > 0 ? new Date(firstConSec * 1000) : null,
      excepted: parseNumber(f[16] ?? "0") === 1,
      assignedServerGroupId: parseNumber(f[5] ?? "0") || null,
    });
  }

  return users;
}

function parseStatsUsers(valuesBlob: string): Map<string, ParsedStatsUser> {
  const map = new Map<string, ParsedStatsUser>();

  for (const tuple of splitSqlTuples(valuesBlob)) {
    const f = splitFields(tuple);
    const uuid = normalizeTsUuid(unquote(f[0] ?? ""));
    if (!uuid) continue;

    map.set(uuid, {
      uuid,
      periodOnlineSeconds: Math.round(parseNumber(f[5] ?? "0")),
      periodIdleSeconds: Math.round(parseNumber(f[8] ?? "0")),
      removed: parseNumber(f[11] ?? "0") === 1,
    });
  }

  return map;
}

export function parseRanksystemDumpFile(filePath: string): ParsedRanksystemDump {
  const sql = readFileSync(filePath, "utf8");

  const cfgValues = extractInsertValues(sql, "cfg_params");
  const groupsValues = extractInsertValues(sql, "groups");
  const userValues = extractInsertValues(sql, "user");
  const statsValues = extractInsertValues(sql, "stats_user");

  if (!cfgValues || !groupsValues || !userValues || !statsValues) {
    throw new Error(
      "SQL dump missing required tables (cfg_params, groups, user, stats_user)"
    );
  }

  const cfg = parseCfgParams(cfgValues);
  const rankupDefinition = cfg.get("rankup_definition") ?? "";
  if (!rankupDefinition) {
    throw new Error("rankup_definition not found in cfg_params");
  }

  return {
    rankupDefinition,
    tiers: parseRankupDefinition(rankupDefinition),
    groups: parseGroups(groupsValues),
    users: parseUsers(userValues),
    statsByUuid: parseStatsUsers(statsValues),
  };
}
