"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { IDLE_OPTIONS } from "@/components/dashboard/create-server-wizard";
import { useInstance } from "@/components/dashboard/instance/instance-context";
import { MinecraftSourceEditor } from "@/components/dashboard/minecraft-source-editor";
import { Hint, Panel } from "@/components/dashboard/panel";
import { ServerTypePicker } from "@/components/dashboard/server-type-picker";
import { FieldLabel, SettingsFields } from "@/components/dashboard/settings-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dashboardApi } from "@/lib/api/dashboard-client";
import { getGameDefinition, type SettingValues } from "@/lib/games/catalog";
import type { MinecraftSource } from "@/lib/games/minecraft-source";
import type { HetznerOptions } from "@/lib/hetzner/types";

function SaveButton({ onClick, saving, dirty, disabled }: { onClick: () => void; saving: boolean; dirty: boolean; disabled?: boolean }) {
  return (
    <Button onClick={onClick} disabled={saving || !dirty || disabled} className="rounded-xl">
      {saving ? <Loader2 className="animate-spin" /> : <Save />} Speichern
    </Button>
  );
}

function usePatch() {
  const { detail, refresh } = useInstance();
  const [saving, setSaving] = useState(false);
  const save = async (json: Record<string, unknown>, message = "Gespeichert"): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await dashboardApi<{ applyJobId: number | null; serverTypeChangedWhileRunning: boolean }>(
        `/api/internal/dashboard/instances/${detail.id}`,
        { method: "PATCH", json }
      );
      toast.success(
        res.applyJobId
          ? `${message} – wird jetzt auf den laufenden Server angewendet (kurzer Neustart).`
          : res.serverTypeChangedWhileRunning
            ? `${message} – der neue Servertyp gilt ab dem nächsten Ausschalten & Starten.`
            : message
      );
      await refresh();
      return true;
    } catch (error) {
      toast.error((error as Error).message);
      return false;
    } finally {
      setSaving(false);
    }
  };
  return { save, saving };
}

function GeneralSettings({ readOnly }: { readOnly: boolean }) {
  const { detail } = useInstance();
  const { save, saving } = usePatch();
  const def = getGameDefinition(detail.gameType);
  const initial = {
    name: detail.name,
    subdomain: detail.subdomain ?? "",
    idleMinutes: String(detail.idleMinutes),
    backupRetention: detail.backupRetention,
    backupOnHibernate: detail.backupOnHibernate,
  };
  const [form, setForm] = useState(initial);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const idleOptions = IDLE_OPTIONS.some((o) => o.value === form.idleMinutes)
    ? IDLE_OPTIONS
    : [...IDLE_OPTIONS, { value: form.idleMinutes, label: `Nach ${form.idleMinutes} Minuten ohne Spieler` }];

  return (
    <Panel
      title="Allgemein"
      actions={
        <SaveButton
          saving={saving}
          dirty={dirty}
          disabled={readOnly}
          onClick={() =>
            save({
              ...form,
              idleMinutes: Number(form.idleMinutes),
              subdomain: detail.domain ? form.subdomain : undefined,
            })
          }
        />
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <FieldLabel htmlFor="name" label="Name" />
          <Input id="name" value={form.name} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        {detail.domain ? (
          <div className="space-y-2">
            <FieldLabel htmlFor="subdomain" label="Adresse" />
            <div className="flex items-center gap-1.5">
              <Input
                id="subdomain"
                className="font-mono"
                value={form.subdomain}
                disabled={readOnly}
                onChange={(e) => setForm({ ...form, subdomain: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })}
              />
              <span className="shrink-0 font-mono text-sm text-muted-foreground">.{detail.domain}</span>
            </div>
          </div>
        ) : null}
        <div className="space-y-2">
          <FieldLabel
            label="Automatisch ausschalten"
            help={def?.features.playerCount ? undefined : "Dieses Spiel meldet keine Spielerzahl – Auto-Aus ist nicht möglich."}
          />
          <Select
            value={form.idleMinutes}
            disabled={readOnly || !def?.features.playerCount}
            onValueChange={(v) => setForm({ ...form, idleMinutes: v })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {idleOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <FieldLabel htmlFor="retention" label="Backups behalten (Anzahl)" />
          <Input
            id="retention"
            type="number"
            min={1}
            max={50}
            disabled={readOnly}
            value={form.backupRetention}
            onChange={(e) => setForm({ ...form, backupRetention: Number(e.target.value) })}
          />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border/60 bg-muted/30 px-3 py-2.5 sm:col-span-2 dark:bg-muted/15">
          <Checkbox
            checked={form.backupOnHibernate}
            disabled={readOnly}
            onCheckedChange={(c) => setForm({ ...form, backupOnHibernate: c === true })}
            className="mt-0.5"
          />
          <span>
            <span className="block text-sm font-medium">Beim Ausschalten automatisch ein Backup erstellen</span>
            <span className="block text-xs text-muted-foreground">Ältere Backups werden entsprechend „Backups behalten“ gelöscht.</span>
          </span>
        </label>
      </div>
    </Panel>
  );
}

function MinecraftSettings({ readOnly }: { readOnly: boolean }) {
  const { detail, curseforgeAvailable } = useInstance();
  const { save, saving } = usePatch();
  const [source, setSource] = useState<MinecraftSource>(detail.minecraft!);
  const dirty = JSON.stringify(source) !== JSON.stringify(detail.minecraft);
  return (
    <Panel
      title="Minecraft-Version & Mods"
      actions={<SaveButton saving={saving} dirty={dirty} disabled={readOnly} onClick={() => save({ minecraft: source })} />}
    >
      <MinecraftSourceEditor
        value={source}
        onChange={setSource}
        curseforgeAvailable={curseforgeAvailable}
        disabled={readOnly}
        existingWorld={Boolean(detail.volume)}
      />
    </Panel>
  );
}

function GameSettings({ readOnly }: { readOnly: boolean }) {
  const { detail } = useInstance();
  const { save, saving } = usePatch();
  const def = getGameDefinition(detail.gameType);
  const [values, setValues] = useState<SettingValues>(detail.settings);
  if (!def) return null;
  const dirty = JSON.stringify(values) !== JSON.stringify(detail.settings);
  return (
    <Panel
      title="Spiel-Einstellungen"
      description={detail.ip ? "Beim Speichern wird der Spielserver mit den neuen Einstellungen neu gestartet." : undefined}
      actions={<SaveButton saving={saving} dirty={dirty} disabled={readOnly} onClick={() => save({ settings: values })} />}
    >
      <SettingsFields
        fields={def.settings}
        values={values}
        disabled={readOnly}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      />
    </Panel>
  );
}

function HardwareSettings({ readOnly }: { readOnly: boolean }) {
  const { detail } = useInstance();
  const { save, saving } = usePatch();
  const def = getGameDefinition(detail.gameType);
  const [options, setOptions] = useState<HetznerOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [serverType, setServerType] = useState(detail.serverType);
  const [region, setRegion] = useState(detail.region);

  useEffect(() => {
    dashboardApi<HetznerOptions>("/api/internal/dashboard/hetzner/options")
      .then(setOptions)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (!def) return null;
  const dirty = serverType !== detail.serverType || region !== detail.region;
  const regionLocked = Boolean(detail.volume);

  return (
    <Panel
      title="Leistung & Standort"
      description="Ein anderer Servertyp wird beim nächsten Einschalten verwendet (bei laufendem Server: ausschalten & neu starten)."
      actions={<SaveButton saving={saving} dirty={dirty} disabled={readOnly} onClick={() => save({ serverType, region })} />}
    >
      {error ? <Hint tone="danger">{error}</Hint> : null}
      {!options ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Lade Servertypen…
        </p>
      ) : (
        <div className="space-y-4">
          <div className="max-w-xs space-y-2">
            <FieldLabel label="Standort" help={regionLocked ? "Fest, weil der Speicher dort liegt." : undefined} />
            <Select value={region} onValueChange={setRegion} disabled={readOnly || regionLocked}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.locations.map((l) => (
                  <SelectItem key={l.name} value={l.name}>
                    {l.city} ({l.country}) · {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ServerTypePicker
            options={options}
            location={region}
            value={serverType}
            onChange={setServerType}
            minRamGb={def.minRamGb}
            recommendedRamGb={def.recommendedRamGb}
            disabled={readOnly}
          />
        </div>
      )}
    </Panel>
  );
}

function DangerRow({ title, description, action }: { title: string; description: ReactNode; action: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0 max-w-xl">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

function DangerZone() {
  const { detail, can, runAction, confirm } = useInstance();
  const router = useRouter();
  const [size, setSize] = useState(String((detail.volume?.sizeGb ?? 0) + 10));
  const hostUp = Boolean(detail.ip);
  const busy = detail.state === "busy";

  return (
    <Panel title="Speicher & Gefahrenzone" className="border-red-500/30">
      <div className="divide-y divide-border/60">
        <DangerRow
          title="Speicher vergrößern"
          description={
            detail.volume
              ? `Aktuell ${detail.volume.sizeGb} GB. Vergrößern geht jederzeit (auch im laufenden Betrieb), verkleinern nicht.`
              : "Der Speicher wird beim ersten Start angelegt."
          }
          action={
            detail.volume ? (
              <div className="flex items-center gap-2">
                <Input type="number" value={size} min={detail.volume.sizeGb + 1} onChange={(e) => setSize(e.target.value)} className="w-24" />
                <span className="text-sm text-muted-foreground">GB</span>
                <Button
                  variant="outline"
                  disabled={busy || !can("instances:update") || Number(size) <= detail.volume.sizeGb}
                  onClick={() =>
                    runAction("resizeVolume", {
                      payload: { sizeGb: Number(size) },
                      confirm: {
                        title: `Speicher auf ${size} GB vergrößern?`,
                        description: "Das lässt sich nicht rückgängig machen – Hetzner-Volumes können nicht verkleinert werden.",
                        confirmLabel: "Vergrößern",
                      },
                    })
                  }
                >
                  Vergrößern
                </Button>
              </div>
            ) : null
          }
        />
        <DangerRow
          title="Spieldaten zurücksetzen"
          description="Löscht Welt, Mods & Konfiguration auf dem Speicher und startet frisch. Vorher wird automatisch ein Backup erstellt."
          action={
            <Button
              variant="outline"
              className="border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
              disabled={busy || !hostUp || !can("instances:delete")}
              title={!hostUp ? "Nur möglich, während der Server läuft" : undefined}
              onClick={() =>
                runAction("wipe", {
                  confirm: {
                    title: "Spieldaten zurücksetzen?",
                    description: "Alle Daten im Datenordner werden gelöscht (ein Backup wird vorher erstellt).",
                    confirmLabel: "Zurücksetzen",
                    destructive: true,
                    typeToConfirm: detail.name,
                  },
                })
              }
            >
              Zurücksetzen
            </Button>
          }
        />
        <DangerRow
          title="Server endgültig löschen"
          description="Löscht VM, Speicher inkl. aller Backups, Firewall und DNS-Eintrag. Das kann nicht rückgängig gemacht werden."
          action={
            <Button
              variant="destructive"
              disabled={!can("instances:delete")}
              onClick={() =>
                confirm(
                  {
                    title: "Server endgültig löschen?",
                    description: "Alle Welten und Backups gehen verloren. Lade vorher bei Bedarf ein Backup herunter.",
                    confirmLabel: "Endgültig löschen",
                    destructive: true,
                    typeToConfirm: detail.name,
                  },
                  async () => {
                    try {
                      await dashboardApi(`/api/internal/dashboard/instances/${detail.id}`, {
                        method: "DELETE",
                        json: { confirm: detail.name },
                      });
                      toast.success("Server wird gelöscht.");
                      router.push("/dashboard");
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }
                )
              }
            >
              Löschen
            </Button>
          }
        />
      </div>
    </Panel>
  );
}

export function SettingsTab() {
  const { detail, can } = useInstance();
  const readOnly = !can("instances:update");
  if (!detail.supported) {
    return (
      <div className="space-y-5">
        <Hint tone="warning">Dieses Spiel wird nicht mehr unterstützt. Du kannst den Server nur noch löschen.</Hint>
        <DangerZone />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {readOnly ? <Hint>Du kannst die Einstellungen ansehen, aber nicht ändern.</Hint> : null}
      <GeneralSettings readOnly={readOnly} />
      {detail.gameType === "minecraft" && detail.minecraft ? <MinecraftSettings readOnly={readOnly} /> : null}
      <GameSettings readOnly={readOnly} />
      <HardwareSettings readOnly={readOnly} />
      <DangerZone />
    </div>
  );
}
