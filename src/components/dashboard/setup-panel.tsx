"use client";

import { CircleCheck, Cloud, ExternalLink, KeyRound, Loader2, Package, Server } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Hint, Panel } from "@/components/dashboard/panel";
import { FieldLabel } from "@/components/dashboard/settings-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardApi } from "@/lib/api/dashboard-client";
import type { LocationOption } from "@/lib/hetzner/types";
import type { SetupSnapshot } from "@/lib/settings/store";

export type { SetupSnapshot };

function Step({
  number,
  done,
  icon,
  title,
  optional,
  children,
}: {
  number: number;
  done: boolean;
  icon: ReactNode;
  title: string;
  optional?: boolean;
  children: ReactNode;
}) {
  const t = useTranslations("dashboard.setup");
  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          <span
            className={
              done
                ? "flex size-7 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"
                : "flex size-7 items-center justify-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
            }
          >
            {done ? <CircleCheck className="size-4" /> : number}
          </span>
          <span className="flex items-center gap-2">
            {icon}
            {title}
            {optional ? <span className="text-xs font-normal text-muted-foreground">{t("optional")}</span> : null}
          </span>
        </span>
      }
    >
      {children}
    </Panel>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

export function SetupPanel({ initial }: { initial: SetupSnapshot }) {
  const t = useTranslations("dashboard.setup");
  const [snap, setSnap] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [hetznerToken, setHetznerToken] = useState("");
  const [cfToken, setCfToken] = useState("");
  const [cfDomain, setCfDomain] = useState(initial.cloudflareDomain ?? "tretu.de");
  const [cfKey, setCfKey] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);

  useEffect(() => {
    if (!snap.status.hetzner) return;
    dashboardApi<{ locations: LocationOption[] }>("/api/internal/dashboard/hetzner/options")
      .then((o) => setLocations(o.locations))
      .catch(() => undefined);
  }, [snap.status.hetzner]);

  const submit = async (section: string, json: Record<string, unknown>, success: string) => {
    setBusy(section);
    try {
      setSnap(await dashboardApi<SetupSnapshot>("/api/internal/dashboard/setup", { method: "POST", json: { section, ...json } }));
      toast.success(success);
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {snap.status.ready ? (
        <Hint>
          {t.rich("ready", { strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
        </Hint>
      ) : null}

      <Step number={1} done={snap.status.ready} icon={<Server className="size-4" />} title={t("hetzner.title")}>
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              {t.rich("hetzner.step1", {
                link: (chunks) => <ExtLink href="https://console.hetzner.com/projects">{chunks}</ExtLink>,
              })}
            </li>
            <li>{t.rich("hetzner.step2", { strong: (chunks) => <strong>{chunks}</strong> })}</li>
            <li>{t("hetzner.step3")}</li>
          </ol>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await submit("hetzner", { token: hetznerToken }, t("hetzner.connected"))) setHetznerToken("");
            }}
          >
            <Input
              type="password"
              autoComplete="off"
              value={hetznerToken}
              onChange={(e) => setHetznerToken(e.target.value)}
              placeholder={snap.status.hetzner ? t("hetzner.tokenStored") : t("hetzner.tokenPlaceholder")}
              className="font-mono"
            />
            <Button type="submit" disabled={!hetznerToken.trim() || busy !== null} className="shrink-0">
              {busy === "hetzner" ? <Loader2 className="animate-spin" /> : null}
              {snap.status.hetzner ? t("hetzner.replace") : t("connect")}
            </Button>
          </form>

          {snap.status.hetzner && locations.length ? (
            <div className="max-w-sm space-y-2">
              <FieldLabel label={t("hetzner.location")} help={t("hetzner.locationHelp")} />
              <Select
                value={snap.defaultLocation}
                disabled={busy !== null}
                onValueChange={(location) => void submit("location", { location }, t("hetzner.locationSaved"))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((l) => (
                    <SelectItem key={l.name} value={l.name}>
                      {l.city} ({l.country}) · {l.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {snap.sshPublicKey ? (
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">{t("hetzner.sshKey")}</summary>
              <code className="mt-2 block break-all rounded-lg bg-muted p-2 font-mono">{snap.sshPublicKey}</code>
            </details>
          ) : null}
        </div>
      </Step>

      <Step number={2} done={snap.status.cloudflare} icon={<Cloud className="size-4" />} title={t("cloudflare.title")} optional>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t.rich("cloudflare.intro", {
              host: `mc.${cfDomain || "tretu.de"}`,
              mono: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              {t.rich("cloudflare.step1", {
                link: (chunks) => <ExtLink href="https://dash.cloudflare.com/profile/api-tokens">{chunks}</ExtLink>,
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </li>
            <li>{t("cloudflare.step2")}</li>
          </ol>
          {snap.status.cloudflare ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">
                {t.rich("cloudflare.connectedWith", {
                  domain: snap.cloudflareDomain ?? "",
                  mono: (chunks) => <span className="font-mono font-semibold">{chunks}</span>,
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => void submit("cloudflare", { remove: true }, t("cloudflare.disconnected"))}
              >
                {t("disconnect")}
              </Button>
            </div>
          ) : (
            <form
              className="grid gap-2 sm:grid-cols-[1fr_200px_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await submit("cloudflare", { token: cfToken, domain: cfDomain }, t("cloudflare.connected"))) setCfToken("");
              }}
            >
              <Input
                type="password"
                autoComplete="off"
                value={cfToken}
                onChange={(e) => setCfToken(e.target.value)}
                placeholder={t("cloudflare.tokenPlaceholder")}
                className="font-mono"
              />
              <Input value={cfDomain} onChange={(e) => setCfDomain(e.target.value)} placeholder="tretu.de" className="font-mono" />
              <Button type="submit" disabled={!cfToken.trim() || !cfDomain.trim() || busy !== null}>
                {busy === "cloudflare" ? <Loader2 className="animate-spin" /> : null} {t("connect")}
              </Button>
            </form>
          )}
        </div>
      </Step>

      <Step number={3} done={snap.status.curseforge} icon={<Package className="size-4" />} title={t("curseforge.title")} optional>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t.rich("curseforge.intro", {
              link: (chunks) => <ExtLink href="https://console.curseforge.com/">{chunks}</ExtLink>,
            })}
          </p>
          {snap.status.curseforge ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => void submit("curseforge", { remove: true }, t("curseforge.removed"))}
            >
              {t("curseforge.remove")}
            </Button>
          ) : (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await submit("curseforge", { apiKey: cfKey }, t("curseforge.connected"))) setCfKey("");
              }}
            >
              <Input
                type="password"
                autoComplete="off"
                value={cfKey}
                onChange={(e) => setCfKey(e.target.value)}
                placeholder={t("curseforge.keyPlaceholder")}
                className="font-mono"
              />
              <Button type="submit" disabled={!cfKey.trim() || busy !== null} className="shrink-0">
                {busy === "curseforge" ? <Loader2 className="animate-spin" /> : null} {t("save")}
              </Button>
            </form>
          )}
        </div>
      </Step>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="size-4" /> {t("security.title")}
          </span>
        }
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>{t("security.encrypted")}</li>
          <li>{t("security.firewall")}</li>
          <li>
            {t.rich("security.team", {
              link: (chunks) => (
                <a href="/dashboard/team" className="underline">
                  {chunks}
                </a>
              ),
              mono: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </li>
        </ul>
      </Panel>
    </div>
  );
}
