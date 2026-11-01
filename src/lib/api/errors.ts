import { getTranslations } from "next-intl/server";

import { fail } from "@/lib/api/respond";
import { SettingsError } from "@/lib/dashboard/instance-input";
import { getGameDefinition } from "@/lib/games/catalog";
import { LocalizedError, type MessageValues } from "@/lib/i18n/errors";

/** `fail()` with a message from `api.errors.<key>` in the visitor's language. */
export async function failKey(key: string, status: number, values: MessageValues = {}) {
  const t = await getTranslations("api.errors");
  return fail(t(key, values), status);
}

async function settingsMessage(error: SettingsError): Promise<string> {
  const t = await getTranslations("api.errors");
  const tGames = await getTranslations("games");
  const def = getGameDefinition(error.gameId);
  return error.issues
    .map((issue) => {
      const labelKey = `${error.gameId}.settings.${issue.field}.label`;
      const label = tGames.has(labelKey)
        ? tGames(labelKey)
        : (def?.settings.find((f) => f.key === issue.field)?.label ?? issue.field);
      const values = Object.fromEntries(
        Object.entries(issue).filter(([key]) => key !== "code" && key !== "field")
      ) as Record<string, number>;
      return t(`settingsIssues.${issue.code}`, { label, ...values });
    })
    .join(" ");
}

/**
 * Error response for anything a route handler caught: localized errors are translated (with their status),
 * other errors are reported with a translated prefix (`wrapKey`) and their technical message.
 */
export async function failFromError(error: unknown, options: { status?: number; wrapKey?: string } = {}) {
  const t = await getTranslations("api.errors");
  if (error instanceof SettingsError) return fail(await settingsMessage(error), error.status);
  if (error instanceof LocalizedError) return fail(t(error.key, error.values), error.status);
  const detail = error instanceof Error && error.message ? error.message : t("unknown");
  return fail(options.wrapKey ? t(options.wrapKey, { detail }) : detail, options.status ?? 502);
}
