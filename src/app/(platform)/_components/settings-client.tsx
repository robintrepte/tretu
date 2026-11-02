"use client";

import { Eye, Lock, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { NotificationCategory, NotificationSettings } from "@/lib/platform/notifications";
import type { Visibility } from "@/lib/platform/profile";
import type { TsLinkState } from "@/lib/platform/teamspeak";
import { cn } from "@/lib/utils";

import { meApi, MeApiError } from "./api";
import { useT } from "./i18n-provider";

const CATEGORIES: NotificationCategory[] = ["social", "invite", "achievement", "wallet", "app"];
const VISIBILITY_OPTIONS: { value: Visibility; icon: typeof Eye }[] = [
  { value: "public", icon: Eye },
  { value: "friends", icon: Users },
  { value: "private", icon: Lock },
];

type SettingsResponse = { visibility: Visibility; notifications: NotificationSettings };

export function SettingsClient({
  initialVisibility,
  initialNotifications,
}: {
  initialVisibility: Visibility;
  initialNotifications: NotificationSettings;
}) {
  const t = useT();
  const [visibility, setVisibility] = useState(initialVisibility);
  const [notifications, setNotifications] = useState(initialNotifications);

  async function save(body: Partial<{ visibility: Visibility; notifications: Partial<NotificationSettings> }>) {
    try {
      const res = await meApi<SettingsResponse>("/settings", { method: "PUT", body });
      setVisibility(res.visibility);
      setNotifications(res.notifications);
      toast.success(t("common.saved"));
    } catch {
      toast.error(t("common.error"));
    }
  }

  return (
    <>
      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-xl font-semibold">{t("settings.privacyTitle")}</h2>
        <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={t("settings.privacyTitle")}>
          {VISIBILITY_OPTIONS.map(({ value, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={visibility === value}
              onClick={() => value !== visibility && save({ visibility: value })}
              className={cn(
                "flex flex-col gap-2 rounded-xl border p-4 text-left transition-colors",
                visibility === value
                  ? "border-[var(--tretu-accent)] bg-[var(--tretu-accent)]/10"
                  : "border-border hover:border-[var(--tretu-accent)]/50"
              )}
            >
              <span className="flex items-center gap-2 font-semibold">
                <Icon className={cn("size-5", visibility === value && "text-[var(--tretu-accent)]")} aria-hidden />
                {t(`settings.privacy.${value}`)}
              </span>
              <span className="text-sm text-muted-foreground">{t(`settings.privacy.${value}Hint`)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:p-6">
        <h2 className="mb-4 text-xl font-semibold">{t("settings.notificationsTitle")}</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="pb-2 font-medium" />
              <th className="w-20 pb-2 text-center font-medium">{t("settings.inApp")}</th>
              <th className="w-20 pb-2 text-center font-medium">{t("settings.push")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {CATEGORIES.map((category) => (
              <tr key={category}>
                <td className="py-3 font-medium">{t(`settings.categories.${category}`)}</td>
                <td className="py-3 text-center">
                  <Checkbox
                    checked={notifications[category].inApp}
                    aria-label={`${t(`settings.categories.${category}`)}: ${t("settings.inApp")}`}
                    onCheckedChange={(checked) => save({ notifications: { [category]: { inApp: checked === true } } })}
                  />
                </td>
                <td className="py-3 text-center">
                  <Checkbox
                    checked={notifications[category].push && notifications[category].inApp}
                    disabled={!notifications[category].inApp}
                    aria-label={`${t(`settings.categories.${category}`)}: ${t("settings.push")}`}
                    onCheckedChange={(checked) => save({ notifications: { [category]: { push: checked === true } } })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

export function TeamspeakLink({ initial }: { initial: TsLinkState }) {
  const t = useT();
  const [state, setState] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function act(work: () => Promise<void>) {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      const code = error instanceof MeApiError ? error.code : "error";
      const key = `settings.teamspeakErrors.${code}`;
      toast.error(t(key) === key ? t("common.error") : t(key));
      // auth.tretu.de refused the identity after the check: the link was undone, show why.
      if (code === "ts_identity_taken_auth") setState({ linked: false, nickname: null, code: null, codeExpiresAt: null, error: code });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="teamspeak" className="scroll-mt-24 rounded-2xl border border-border/70 bg-card p-5 shadow-sm md:p-6">
      <h2 className="mb-2 text-xl font-semibold">{t("settings.teamspeakTitle")}</h2>
      <p className="mb-4 text-sm text-muted-foreground">{t("settings.teamspeakText")}</p>
      {state.error && !state.linked ? (
        <p role="alert" data-testid="teamspeak-error" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {t(`settings.teamspeakErrors.${state.error}`) === `settings.teamspeakErrors.${state.error}`
            ? t("common.error")
            : t(`settings.teamspeakErrors.${state.error}`)}
        </p>
      ) : null}
      {state.linked ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-sm text-emerald-700 dark:text-emerald-300">
            {t("settings.teamspeakLinked", { nickname: state.nickname ?? "" })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() =>
              act(async () => {
                await meApi("/teamspeak", { method: "DELETE", body: {} });
                setState({ linked: false, nickname: null, code: null, codeExpiresAt: null, error: null });
              })
            }
          >
            {t("settings.teamspeakUnlink")}
          </Button>
        </div>
      ) : state.code ? (
        <div className="space-y-3">
          <p className="text-sm">
            {t("settings.teamspeakStep", { code: state.code })}
          </p>
          <code className="inline-block rounded-lg bg-muted px-3 py-1.5 font-mono text-lg font-semibold tracking-wider">{state.code}</code>
          <div>
            <Button
              disabled={busy}
              className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
              onClick={() =>
                act(async () => {
                  const res = await meApi<{ nickname: string }>("/teamspeak", { method: "POST", body: { action: "verify" } });
                  setState({ linked: true, nickname: res.nickname, code: null, codeExpiresAt: null, error: null });
                  toast.success(t("settings.teamspeakDone"));
                })
              }
            >
              {t("settings.teamspeakVerify")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          disabled={busy}
          className="bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]"
          onClick={() =>
            act(async () => {
              const res = await meApi<{ code: string; expiresAt: string }>("/teamspeak", { method: "POST", body: { action: "start" } });
              setState({ linked: false, nickname: null, code: res.code, codeExpiresAt: res.expiresAt, error: null });
            })
          }
        >
          {t("settings.teamspeakStart")}
        </Button>
      )}
    </section>
  );
}
