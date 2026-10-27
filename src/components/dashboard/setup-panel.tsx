"use client";

import { CircleCheck, Cloud, ExternalLink, KeyRound, Loader2, Package, Server } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Hint, Panel } from "@/components/dashboard/panel";
import { FieldLabel } from "@/components/dashboard/settings-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardApi } from "@/lib/api/dashboard-client";
import type { LocationOption } from "@/lib/hetzner/types";
import type { SetupStatus } from "@/lib/settings/store";

export type SetupSnapshot = {
  status: SetupStatus;
  defaultLocation: string;
  cloudflareDomain: string | null;
  sshPublicKey: string | null;
};

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
            {optional ? <span className="text-xs font-normal text-muted-foreground">(optional)</span> : null}
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
          <span className="font-medium text-foreground">Alles bereit.</span> Server können angelegt und gestartet werden.
        </Hint>
      ) : null}

      <Step number={1} done={snap.status.ready} icon={<Server className="size-4" />} title="Hetzner Cloud verbinden">
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              In der <ExtLink href="https://console.hetzner.com/projects">Hetzner Console</ExtLink> ein Projekt öffnen (am besten
              ein eigenes nur für Game-Server).
            </li>
            <li>Sicherheit → API-Tokens → „API-Token generieren“ mit Berechtigung <strong>Lesen &amp; Schreiben</strong>.</li>
            <li>Token hier einfügen. Den SSH-Schlüssel erzeugt und hinterlegt das Dashboard automatisch.</li>
          </ol>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await submit("hetzner", { token: hetznerToken }, "Hetzner verbunden")) setHetznerToken("");
            }}
          >
            <Input
              type="password"
              autoComplete="off"
              value={hetznerToken}
              onChange={(e) => setHetznerToken(e.target.value)}
              placeholder={snap.status.hetzner ? "Token hinterlegt – zum Ersetzen neuen eingeben" : "Hetzner API-Token"}
              className="font-mono"
            />
            <Button type="submit" disabled={!hetznerToken.trim() || busy !== null} className="shrink-0">
              {busy === "hetzner" ? <Loader2 className="animate-spin" /> : null}
              {snap.status.hetzner ? "Token ersetzen" : "Verbinden"}
            </Button>
          </form>

          {snap.status.hetzner && locations.length ? (
            <div className="max-w-sm space-y-2">
              <FieldLabel label="Standard-Standort für neue Server" help="Nürnberg/Falkenstein haben die beste Anbindung in DE." />
              <Select
                value={snap.defaultLocation}
                disabled={busy !== null}
                onValueChange={(location) => submit("location", { location }, "Standort gespeichert")}
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
              <summary className="cursor-pointer">Öffentlicher SSH-Schlüssel des Dashboards</summary>
              <code className="mt-2 block break-all rounded-lg bg-muted p-2 font-mono">{snap.sshPublicKey}</code>
            </details>
          ) : null}
        </div>
      </Step>

      <Step number={2} done={snap.status.cloudflare} icon={<Cloud className="size-4" />} title="Cloudflare-DNS" optional>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Damit bekommt jeder Server eine feste Adresse wie <span className="font-mono">mc.{cfDomain || "tretu.de"}</span>, die
            beim Start automatisch auf die neue IP zeigt. Ohne Cloudflare verbinden sich Spieler über die (wechselnde) IP.
          </p>
          <ol className="list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>
              <ExtLink href="https://dash.cloudflare.com/profile/api-tokens">Cloudflare → API-Tokens</ExtLink> → „Token
              erstellen“ → Vorlage <strong>„DNS-Zone bearbeiten“</strong>.
            </li>
            <li>Bei „Zonenressourcen“ die Domain auswählen, Token erstellen und hier einfügen.</li>
          </ol>
          {snap.status.cloudflare ? (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm">
                Verbunden mit <span className="font-mono font-semibold">{snap.cloudflareDomain}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy !== null}
                onClick={() => submit("cloudflare", { remove: true }, "Cloudflare getrennt")}
              >
                Trennen
              </Button>
            </div>
          ) : (
            <form
              className="grid gap-2 sm:grid-cols-[1fr_200px_auto]"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await submit("cloudflare", { token: cfToken, domain: cfDomain }, "Cloudflare verbunden")) setCfToken("");
              }}
            >
              <Input
                type="password"
                autoComplete="off"
                value={cfToken}
                onChange={(e) => setCfToken(e.target.value)}
                placeholder="Cloudflare API-Token"
                className="font-mono"
              />
              <Input value={cfDomain} onChange={(e) => setCfDomain(e.target.value)} placeholder="tretu.de" className="font-mono" />
              <Button type="submit" disabled={!cfToken.trim() || !cfDomain.trim() || busy !== null}>
                {busy === "cloudflare" ? <Loader2 className="animate-spin" /> : null} Verbinden
              </Button>
            </form>
          )}
        </div>
      </Step>

      <Step number={3} done={snap.status.curseforge} icon={<Package className="size-4" />} title="CurseForge-Modpacks" optional>
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            Modrinth-Modpacks funktionieren sofort. Für CurseForge-Modpacks braucht es einen kostenlosen API-Key aus der{" "}
            <ExtLink href="https://console.curseforge.com/">CurseForge Console</ExtLink> (API Keys).
          </p>
          {snap.status.curseforge ? (
            <Button
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={() => submit("curseforge", { remove: true }, "CurseForge-Key entfernt")}
            >
              Key entfernen
            </Button>
          ) : (
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await submit("curseforge", { apiKey: cfKey }, "CurseForge verbunden")) setCfKey("");
              }}
            >
              <Input
                type="password"
                autoComplete="off"
                value={cfKey}
                onChange={(e) => setCfKey(e.target.value)}
                placeholder="CurseForge API-Key"
                className="font-mono"
              />
              <Button type="submit" disabled={!cfKey.trim() || busy !== null} className="shrink-0">
                {busy === "curseforge" ? <Loader2 className="animate-spin" /> : null} Speichern
              </Button>
            </form>
          )}
        </div>
      </Step>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <KeyRound className="size-4" /> Zugänge &amp; Sicherheit
          </span>
        }
      >
        <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
          <li>Tokens und der SSH-Schlüssel werden verschlüsselt in der Datenbank gespeichert (Schlüssel: DASHBOARD_SECRET_KEY bzw. AUTH_SECRET).</li>
          <li>Jeder Server bekommt eine eigene Hetzner-Firewall, die nur SSH und die Spiel-Ports öffnet.</li>
          <li>
            Wer das Dashboard nutzen darf, legst du unter <a href="/dashboard/team" className="underline">Team</a> fest. Neue Admins
            per Discord-ID über <span className="font-mono">DASHBOARD_ADMIN_DISCORD_IDS</span>.
          </li>
        </ul>
      </Panel>
    </div>
  );
}
