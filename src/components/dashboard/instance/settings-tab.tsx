"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("dashboard.common");
  return (
    <Button onClick={onClick} disabled={saving || !dirty || disabled} className="rounded-xl">
      {saving ? <Loader2 className="animate-spin" /> : <Save />} {t("save")}
    </Button>
  );
}

function usePatch() {
  const t = useTranslations("dashboard.settings");
  const { detail, refresh } = useInstance();
  const [saving, setSaving] = useState(false);
  const save = async (json: Record<string, unknown>, message = t("saved")): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await dashboardApi<{ applyJobId: number | null; serverTypeChangedWhileRunning: boolean }>(
        `/api/internal/dashboard/instances/${detail.id}`,
        { method: "PATCH", json }
      );
      toast.success(
        res.applyJobId
          ? t("savedApplying", { message })
          : res.serverTypeChangedWhileRunning
            ? t("savedNextStart", { message })
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
  const t = useTranslations("dashboard.settings");
  const tDash = useTranslations("dashboard");
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
  const idleOptions = [
    ...IDLE_OPTIONS.map((value) => ({ value: value as string, label: tDash(`idle.${value}`) })),
    ...((IDLE_OPTIONS as readonly string[]).includes(form.idleMinutes)
      ? []
      : [{ value: form.idleMinutes, label: tDash("idle.custom", { minutes: form.idleMinutes }) }]),
  ];

  return (
    <Panel
      title={t("general")}
      actions={
        <SaveButton
          saving={saving}
          dirty={dirty}
          disabled={readOnly}
          onClick={() =>
            void save({
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
          <FieldLabel htmlFor="name" label={t("name")} />
          <Input id="name" value={form.name} disabled={readOnly} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        {detail.domain ? (
          <div className="space-y-2">
            <FieldLabel htmlFor="subdomain" label={t("address")} />
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
            label={t("idle")}
            help={def?.features.playerCount ? undefined : t("idleUnavailable")}
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
          <FieldLabel htmlFor="retention" label={t("retention")} />
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
            <span className="block text-sm font-medium">{t("backupOnHibernate")}</span>
            <span className="block text-xs text-muted-foreground">{t("backupOnHibernateHint")}</span>
          </span>
        </label>
      </div>
    </Panel>
  );
}

function MinecraftSettings({ readOnly }: { readOnly: boolean }) {
  const t = useTranslations("dashboard.settings");
  const { detail, curseforgeAvailable } = useInstance();
  const { save, saving } = usePatch();
  const [source, setSource] = useState<MinecraftSource>(detail.minecraft!);
  const dirty = JSON.stringify(source) !== JSON.stringify(detail.minecraft);
  return (
    <Panel
      title={t("minecraft")}
      actions={<SaveButton saving={saving} dirty={dirty} disabled={readOnly} onClick={() => void save({ minecraft: source })} />}
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
  const t = useTranslations("dashboard.settings");
  const { detail } = useInstance();
  const { save, saving } = usePatch();
  const def = getGameDefinition(detail.gameType);
  const [values, setValues] = useState<SettingValues>(detail.settings);
  if (!def) return null;
  const dirty = JSON.stringify(values) !== JSON.stringify(detail.settings);
  return (
    <Panel
      title={t("game")}
      description={detail.ip ? t("gameRestartHint") : undefined}
      actions={<SaveButton saving={saving} dirty={dirty} disabled={readOnly} onClick={() => void save({ settings: values })} />}
    >
      <SettingsFields
        gameId={def.id}
        fields={def.settings}
        values={values}
        disabled={readOnly}
        onChange={(key, value) => setValues((v) => ({ ...v, [key]: value }))}
      />
    </Panel>
  );
}

function HardwareSettings({ readOnly }: { readOnly: boolean }) {
  const t = useTranslations("dashboard.settings");
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
      title={t("hardware")}
      description={t("hardwareHint")}
      actions={<SaveButton saving={saving} dirty={dirty} disabled={readOnly} onClick={() => void save({ serverType, region })} />}
    >
      {error ? <Hint tone="danger">{error}</Hint> : null}
      {!options ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> {t("loadingTypes")}
        </p>
      ) : (
        <div className="space-y-4">
          <div className="max-w-xs space-y-2">
            <FieldLabel label={t("location")} help={regionLocked ? t("locationLocked") : undefined} />
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
  const t = useTranslations("dashboard.settings");
  const { detail, can, runAction, confirm } = useInstance();
  const router = useRouter();
  const [size, setSize] = useState(String((detail.volume?.sizeGb ?? 0) + 10));
  const hostUp = Boolean(detail.ip);
  const busy = detail.state === "busy";

  return (
    <Panel title={t("danger")} className="border-red-500/30">
      <div className="divide-y divide-border/60">
        <DangerRow
          title={t("resize")}
          description={detail.volume ? t("resizeHint", { size: detail.volume.sizeGb }) : t("resizeNoVolume")}
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
                        title: t("resizeTitle", { size }),
                        description: t("resizeText"),
                        confirmLabel: t("resizeButton"),
                      },
                    })
                  }
                >
                  {t("resizeButton")}
                </Button>
              </div>
            ) : null
          }
        />
        <DangerRow
          title={t("wipe")}
          description={t("wipeHint")}
          action={
            <Button
              variant="outline"
              className="border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-400"
              disabled={busy || !hostUp || !can("instances:delete")}
              title={!hostUp ? t("onlyWhenRunning") : undefined}
              onClick={() =>
                runAction("wipe", {
                  confirm: {
                    title: t("wipeTitle"),
                    description: t("wipeText"),
                    confirmLabel: t("wipeButton"),
                    destructive: true,
                    typeToConfirm: detail.name,
                  },
                })
              }
            >
              {t("wipeButton")}
            </Button>
          }
        />
        <DangerRow
          title={t("destroy")}
          description={t("destroyHint")}
          action={
            <Button
              variant="destructive"
              disabled={!can("instances:delete")}
              onClick={() =>
                confirm(
                  {
                    title: t("destroyTitle"),
                    description: t("destroyText"),
                    confirmLabel: t("destroyConfirm"),
                    destructive: true,
                    typeToConfirm: detail.name,
                  },
                  async () => {
                    try {
                      await dashboardApi(`/api/internal/dashboard/instances/${detail.id}`, {
                        method: "DELETE",
                        json: { confirm: detail.name },
                      });
                      toast.success(t("destroying"));
                      router.push("/dashboard");
                    } catch (error) {
                      toast.error((error as Error).message);
                    }
                  }
                )
              }
            >
              {t("destroyButton")}
            </Button>
          }
        />
      </div>
    </Panel>
  );
}

export function SettingsTab() {
  const t = useTranslations("dashboard.settings");
  const { detail, can } = useInstance();
  const readOnly = !can("instances:update");
  if (!detail.supported) {
    return (
      <div className="space-y-5">
        <Hint tone="warning">{t("unsupported")}</Hint>
        <DangerZone />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      {readOnly ? <Hint>{t("readOnly")}</Hint> : null}
      <GeneralSettings readOnly={readOnly} />
      {detail.gameType === "minecraft" && detail.minecraft ? <MinecraftSettings readOnly={readOnly} /> : null}
      <GameSettings readOnly={readOnly} />
      <HardwareSettings readOnly={readOnly} />
      <DangerZone />
    </div>
  );
}
