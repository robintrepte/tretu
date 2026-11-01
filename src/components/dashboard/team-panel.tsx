"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

import { Panel } from "@/components/dashboard/panel";
import { Checkbox } from "@/components/ui/checkbox";
import { dashboardApi } from "@/lib/api/dashboard-client";
import { useFormat } from "@/components/dashboard/use-format";
import type { Role } from "@/lib/permissions/types";

export type TeamMember = {
  id: number;
  displayName: string;
  avatarUrl: string | null;
  discordId: string | null;
  roles: Role[];
  lastLoginAt: string;
};

const EDITABLE_ROLES: Role[] = ["admin", "operator", "manager"];

export function TeamPanel({ initial, currentUserId }: { initial: TeamMember[]; currentUserId: number }) {
  const t = useTranslations("dashboard.team");
  const tRoles = useTranslations("dashboard.roles");
  const format = useFormat();
  const [members, setMembers] = useState(initial);
  const [saving, setSaving] = useState<number | null>(null);

  const toggle = async (member: TeamMember, role: Role, enabled: boolean) => {
    const roles = enabled ? [...member.roles, role] : member.roles.filter((r) => r !== role);
    setSaving(member.id);
    try {
      await dashboardApi(`/api/internal/dashboard/users/${member.id}`, { method: "PUT", json: { roles } });
      setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, roles } : m)));
      toast.success(t("saved"));
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-5">
      <Panel title={t("roles")}>
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          {EDITABLE_ROLES.map((role) => (
            <div key={role} className="rounded-xl bg-muted/40 p-3 dark:bg-muted/20">
              <dt className="font-medium">{tRoles(`${role}.label`)}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-muted-foreground">{tRoles(`${role}.description`)}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel
        title={t("members")}
        description={t("membersHint")}
      >
        <ul className="divide-y divide-border/60">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-4 py-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                {m.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={m.avatarUrl} alt="" className="size-9 rounded-full" />
                ) : (
                  <div className="size-9 rounded-full bg-muted" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {m.displayName}
                    {m.id === currentUserId ? <span className="ml-2 text-xs text-muted-foreground">{t("you")}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">{t("lastActive", { date: format.dateTime(m.lastLoginAt) })}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                {EDITABLE_ROLES.map((role) => (
                  <label key={role} className="flex cursor-pointer items-center gap-2 text-sm">
                    <Checkbox
                      checked={m.roles.includes(role)}
                      disabled={saving === m.id || (role === "admin" && m.id === currentUserId)}
                      onCheckedChange={(c) => void toggle(m, role, c === true)}
                    />
                    {tRoles(`${role}.label`)}
                  </label>
                ))}
                {saving === m.id ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
