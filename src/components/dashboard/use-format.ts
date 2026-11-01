"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { INTL_LOCALE, resolveLocale } from "@/i18n/config";
import {
  formatBytes,
  formatDateTime,
  formatDuration,
  formatEuro,
  formatRelative,
} from "@/lib/dashboard/format";
import type { GameDefinition, SettingField } from "@/lib/games/catalog";

/** Dashboard formatters bound to the current UI language. */
export function useFormat() {
  const intl = INTL_LOCALE[resolveLocale(useLocale())];
  return useMemo(
    () => ({
      intl,
      bytes: (bytes: number | null | undefined) => formatBytes(bytes, intl),
      euro: (value: number | null | undefined, digits = 2) => formatEuro(value, digits, intl),
      dateTime: (iso: string | null | undefined) => formatDateTime(iso, intl),
      relative: (iso: string | null | undefined, now?: number) => formatRelative(iso, now ?? Date.now(), intl),
      duration: (ms: number) => formatDuration(ms, intl),
      number: (value: number, digits = 0) => value.toLocaleString(intl, { maximumFractionDigits: digits }),
    }),
    [intl]
  );
}

/**
 * Game catalog texts in the current language. German lives in the catalog itself; English comes from the
 * `games` messages and falls back to German for anything not translated.
 */
export function useGameText() {
  const t = useTranslations("games");
  return useMemo(() => {
    const pick = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);
    return {
      label: (def: Pick<GameDefinition, "id" | "label">) => pick(`${def.id}.label`, def.label),
      tagline: (def: Pick<GameDefinition, "id" | "tagline">) => pick(`${def.id}.tagline`, def.tagline),
      connectHint: (def: Pick<GameDefinition, "id" | "connectHint">) => pick(`${def.id}.connectHint`, def.connectHint),
      note: (def: Pick<GameDefinition, "id">, index: number, fallback: string) => pick(`${def.id}.notes.${index}`, fallback),
      port: (def: Pick<GameDefinition, "id">, port: { port: string; protocol: string; label: string }) =>
        pick(`${def.id}.ports.${port.port.replace("-", "_")}_${port.protocol}`, port.label),
      field: (gameId: string, field: SettingField) => ({
        label: pick(`${gameId}.settings.${field.key}.label`, field.label),
        help: field.help ? pick(`${gameId}.settings.${field.key}.help`, field.help) : undefined,
        placeholder:
          "placeholder" in field && field.placeholder
            ? pick(`${gameId}.settings.${field.key}.placeholder`, field.placeholder)
            : undefined,
        option: (value: string, fallback: string) => pick(`${gameId}.settings.${field.key}.options.${value}`, fallback),
      }),
    };
  }, [t]);
}
