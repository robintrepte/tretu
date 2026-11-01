"use client";

import { useTranslations } from "next-intl";

import { Input } from "@/components/ui/input";

export function RankingUserSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations("ranking");
  return (
    <Input
      type="search"
      placeholder={t("searchPlaceholder")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="max-w-xs"
      aria-label={t("searchLabel")}
    />
  );
}
