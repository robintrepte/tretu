"use client";

import { Archive, FolderOpen, History, LayoutDashboard, Settings2, Terminal } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";

import { GameThumbnail } from "@/components/dashboard/game-thumbnail";
import { BackupsTab } from "@/components/dashboard/instance/backups-tab";
import { ConsoleTab } from "@/components/dashboard/instance/console-tab";
import { FilesTab } from "@/components/dashboard/instance/files-tab";
import { HistoryTab } from "@/components/dashboard/instance/history-tab";
import { InstanceProvider, useInstance } from "@/components/dashboard/instance/instance-context";
import { OverviewTab } from "@/components/dashboard/instance/overview-tab";
import { SettingsTab } from "@/components/dashboard/instance/settings-tab";
import { StateBadge } from "@/components/dashboard/state-badge";
import type { InstanceDetail } from "@/lib/dashboard/view";
import type { Permission } from "@/lib/permissions/types";
import { cn } from "@/lib/utils";

const TABS: Array<{ id: string; label: string; Icon: ComponentType<{ className?: string }>; Component: ComponentType }> = [
  { id: "overview", label: "Übersicht", Icon: LayoutDashboard, Component: OverviewTab },
  { id: "console", label: "Konsole & Logs", Icon: Terminal, Component: ConsoleTab },
  { id: "files", label: "Dateien", Icon: FolderOpen, Component: FilesTab },
  { id: "settings", label: "Einstellungen", Icon: Settings2, Component: SettingsTab },
  { id: "backups", label: "Backups", Icon: Archive, Component: BackupsTab },
  { id: "history", label: "Verlauf", Icon: History, Component: HistoryTab },
];

function Header() {
  const { detail } = useInstance();
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
      <div className="flex items-stretch">
        <GameThumbnail gameType={detail.gameType} size="sm" className="hidden w-28 shrink-0 sm:flex" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 p-5">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{detail.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{detail.gameLabel}</p>
          </div>
          <StateBadge
            state={detail.state}
            label={detail.activeJob ? `${detail.activeJob.label}…` : undefined}
            className="px-3 py-1.5 text-sm"
          />
        </div>
      </div>
    </div>
  );
}

function Tabs() {
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    if (TABS.some((t) => t.id === fromHash)) setTab(fromHash);
  }, []);

  const select = (id: string) => {
    setTab(id);
    window.history.replaceState(null, "", `#${id}`);
  };

  const Active = TABS.find((t) => t.id === tab)?.Component ?? OverviewTab;
  return (
    <>
      <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Server-Bereiche">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => select(id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition-colors",
              tab === id ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </nav>
      <Active />
    </>
  );
}

export function InstanceManager({
  initial,
  permissions,
  curseforgeAvailable,
}: {
  initial: InstanceDetail;
  permissions: Permission[];
  curseforgeAvailable: boolean;
}) {
  return (
    <InstanceProvider initial={initial} permissions={permissions} curseforgeAvailable={curseforgeAvailable}>
      <div className="space-y-5">
        <Header />
        <Tabs />
      </div>
    </InstanceProvider>
  );
}
