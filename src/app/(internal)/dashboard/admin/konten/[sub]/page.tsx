import { ExternalLink, Lock, LogOut, ShieldOff, MailCheck, Unlock, Plus, X, RefreshCw } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

import {
  addRoleAction,
  grantBadgeAction,
  lockAction,
  removeLinkAction,
  removeRoleAction,
  resetTwoFactorAction,
  resyncBadgesAction,
  revokeBadgeAction,
  revokeSessionsAction,
  unlockAction,
  verifyEmailAction,
} from "@/app/(internal)/dashboard/admin/actions";
import { SelectField, TextField, UntilField } from "@/components/admin/fields";
import { MergeDialog } from "@/components/admin/merge-dialog";
import { ReasonDialog } from "@/components/admin/reason-dialog";
import { Empty, Field, PageHeader, Pill } from "@/components/admin/ui";
import { CopyButton } from "@/components/dashboard/copy-button";
import { Hint, Panel } from "@/components/dashboard/panel";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { getAccountView, SUB_PATTERN } from "@/lib/admin/accounts";
import type { AdminUserDetail } from "@/lib/admin/auth-admin";
import { actionMessageKey, adminFormat } from "@/lib/admin/format";
import { BADGES } from "@/lib/platform/badges";

export const dynamic = "force-dynamic";

function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y divide-border/60 text-sm">{children}</ul>;
}

function Row({ children, actions, testId }: { children: ReactNode; actions?: ReactNode; testId?: string }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-2" data-testid={testId}>
      <div className="min-w-0">{children}</div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </li>
  );
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function AccountDetailPage({ params }: { params: Promise<{ sub: string }> }) {
  const actor = await requireAccountAdminPage();
  const { sub: raw } = await params;
  const sub = safeDecode(raw);
  const [t, f] = await Promise.all([getTranslations("admin"), adminFormat()]);
  if (!SUB_PATTERN.test(sub)) return <Hint tone="danger">{t("account.notFound")}</Hint>;

  const view = await getAccountView(sub, f.locale);
  const user: AdminUserDetail | null = view.auth.ok ? view.auth.user : null;
  const p = view.platform;
  const displayName = user?.name || user?.username || p?.name || p?.username || sub;
  const username = user?.username ?? p?.username ?? null;
  const self = sub === actor.sub;
  const hidden = { sub };

  const providerIds = new Set((user?.providers ?? []).map((pr) => pr.provider));
  const linkCandidates: [string, string | null][] = user
    ? [
        ["minecraft", user.links.minecraftName ? `${user.links.minecraftName} (${user.links.minecraft ?? "?"})` : user.links.minecraft],
        ["steam", providerIds.has("steam") ? null : user.links.steam],
        ["teamspeak", user.links.teamspeak],
        ["discord", providerIds.has("discord") ? null : user.links.discord],
      ]
    : [];
  const gameLinks = linkCandidates.filter((entry): entry is [string, string] => Boolean(entry[1]));

  const providerName = (id: string) => (t.has(`account.providerNames.${id}`) ? t(`account.providerNames.${id}`) : id);

  const earned = new Set(p?.badges.map((b) => b.key) ?? []);
  const grantable = BADGES.filter((b) => !earned.has(b.key));

  return (
    <section className="space-y-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {user?.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt="" className="size-10 rounded-full" />
            ) : null}
            <span data-testid="account-name">{displayName}</span>
            {user?.locked ? (
              <Pill tone="danger" testId="account-locked">
                {t("account.lockedBanner")}
              </Pill>
            ) : null}
            {user?.roles.includes("admin") ? <Pill tone="accent">{t("accounts.flags.admin")}</Pill> : null}
          </span>
        }
        intro={
          <span className="flex flex-wrap items-center gap-2">
            {username ? <span>@{username}</span> : null}
            <span className="font-mono text-xs">{sub}</span>
            <CopyButton value={sub} label={t("common.copySub")} />
          </span>
        }
        actions={
          <Link href="/dashboard/admin/konten" className="text-sm text-muted-foreground hover:text-foreground">
            ← {t("common.back")}
          </Link>
        }
      />

      {!view.auth.ok ? (
        <Hint tone={view.auth.error === "not_found" ? "danger" : "warning"}>
          {view.auth.error === "not_found" ? t("account.notFound") : `${t("account.authError")} ${t(`errors.auth.${view.auth.error}`)}`}
        </Hint>
      ) : null}

      {user?.locked ? (
        <Hint tone="danger">
          {t("account.lockedBanner")} {user.lockedUntil ? t("account.lockedUntil", { date: f.dateTime(user.lockedUntil) }) : t("account.lockedOpenEnded")}
          {user.lockedReason ? ` · ${t("account.lockedReason", { reason: user.lockedReason })}` : null}
        </Hint>
      ) : null}

      {user ? (
        <Panel title={t("account.actions.title")}>
          <div className="flex flex-wrap gap-2">
            {user.locked ? (
              <ReasonDialog action={unlockAction} hidden={hidden} trigger={<><Unlock /> {t("account.actions.unlock")}</>} testId="action-unlock" title={t("account.actions.unlockTitle")} description={t("account.actions.unlockDescription")} confirmLabel={t("account.actions.unlock")} />
            ) : self ? null : (
              <ReasonDialog action={lockAction} hidden={hidden} trigger={<><Lock /> {t("account.actions.lock")}</>} testId="action-lock" title={t("account.actions.lockTitle")} description={t("account.actions.lockDescription")} confirmLabel={t("account.actions.lock")} destructive>
                <UntilField label={t("account.actions.lockUntil")} />
              </ReasonDialog>
            )}
            <ReasonDialog action={revokeSessionsAction} hidden={hidden} trigger={<><LogOut /> {t("account.actions.revokeSessions")}</>} testId="action-revoke-sessions" title={t("account.actions.revokeSessionsTitle")} description={t("account.actions.revokeSessionsDescription")} confirmLabel={t("account.actions.revokeSessions")} destructive />
            {user.twoFactor ? (
              <ReasonDialog action={resetTwoFactorAction} hidden={hidden} trigger={<><ShieldOff /> {t("account.actions.resetTwoFactor")}</>} testId="action-reset-2fa" title={t("account.actions.resetTwoFactorTitle")} description={t("account.actions.resetTwoFactorDescription")} confirmLabel={t("account.actions.resetTwoFactor")} destructive />
            ) : null}
            {user.email && !user.emailVerified ? (
              <ReasonDialog action={verifyEmailAction} hidden={hidden} trigger={<><MailCheck /> {t("account.actions.verifyEmail")}</>} testId="action-verify-email" title={t("account.actions.verifyEmailTitle")} description={t("account.actions.verifyEmailDescription")} confirmLabel={t("account.actions.verifyEmail")} />
            ) : null}
            <MergeDialog from={sub} trigger={t("account.actions.merge")} testId="action-merge" />
          </div>
        </Panel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        {user ? (
          <Panel title={t("account.profile")}>
            <dl>
              <Field label={t("account.username")}>{user.username ?? t("common.none")}</Field>
              <Field label={t("account.name")}>{user.name ?? t("common.none")}</Field>
              <Field label={t("account.email")}>
                {user.email ?? t("common.none")}{" "}
                {user.email ? (
                  <Pill tone={user.emailVerified ? "success" : "warning"}>{user.emailVerified ? t("account.emailVerified") : t("account.emailUnverified")}</Pill>
                ) : null}
              </Field>
              <Field label={t("account.created")}>{f.dateTime(user.createdAt)}</Field>
              <Field label={t("account.lastSignIn")}>{user.lastSignInAt ? f.dateTime(user.lastSignInAt) : t("common.never")}</Field>
              {username ? (
                <Field label={t("account.publicProfile")}>
                  <Link href={`/u/${encodeURIComponent(username)}`} className="underline-offset-2 hover:underline">
                    tretu.de/u/{username}
                  </Link>
                </Field>
              ) : null}
              <Field label={t("account.localUser")}>
                {view.local
                  ? t("account.localRoles", {
                      roles: view.local.roles.length
                        ? view.local.roles.map((r) => `${r.key} (${r.source === "tretu" ? t("account.sourceTretu") : t("account.sourceLocal")})`).join(", ")
                        : t("account.noRoles"),
                    })
                  : t("account.localNever")}
              </Field>
            </dl>
          </Panel>
        ) : null}

        {user ? (
          <Panel title={t("account.security")}>
            <dl>
              <Field label={t("account.roles")}>
                <div className="flex flex-wrap items-center gap-2" data-testid="account-roles">
                  {user.roles.length === 0 ? <span className="text-muted-foreground">{t("account.noRoles")}</span> : null}
                  {user.roles.map((role) => (
                    <span key={role} className="inline-flex items-center gap-1">
                      <Pill tone={role === "admin" ? "accent" : "neutral"}>{role}</Pill>
                      {self && role === "admin" ? null : (
                        <ReasonDialog action={removeRoleAction} hidden={{ ...hidden, role }} trigger={<X />} triggerVariant="ghost" triggerSize="xs" testId={`action-remove-role-${role}`} title={t("account.actions.removeRoleTitle", { role })} description={t("account.actions.removeRoleDescription")} confirmLabel={t("account.actions.removeRole", { role })} destructive />
                      )}
                    </span>
                  ))}
                  <ReasonDialog action={addRoleAction} hidden={hidden} trigger={<><Plus /> {t("account.actions.addRole")}</>} triggerSize="xs" testId="action-add-role" title={t("account.actions.addRoleTitle")} description={t("account.actions.addRoleDescription")} confirmLabel={t("account.actions.addRole")}>
                    <TextField name="role" label={t("account.actions.roleLabel")} defaultValue="admin" pattern="[a-z][a-z0-9_\-]{0,31}" />
                  </ReasonDialog>
                </div>
              </Field>
              <Field label={t("account.twoFactor")}>
                <Pill tone={user.twoFactor ? "success" : "neutral"}>{user.twoFactor ? t("account.twoFactorOn") : t("account.twoFactorOff")}</Pill>
              </Field>
              <Field label={t("account.passkeys")}>
                {user.passkeys.length === 0 ? (
                  <span className="text-muted-foreground">{t("account.noPasskeys")}</span>
                ) : (
                  <ul className="space-y-1">
                    {user.passkeys.map((pk) => (
                      <li key={pk.id}>
                        {pk.name || pk.id} <span className="text-xs text-muted-foreground">· {f.date(pk.createdAt)}{pk.lastUsedAt ? ` · ${t("account.passkeyUsed", { date: f.dateTime(pk.lastUsedAt) })}` : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
              <Field label={t("account.sessions")}>
                {user.sessions.length === 0 ? (
                  <span className="text-muted-foreground">{t("account.noSessions")}</span>
                ) : (
                  <ul className="space-y-1" data-testid="account-sessions">
                    {user.sessions.map((s) => (
                      <li key={s.id} className="text-xs">
                        <span className="text-foreground">{s.client || s.userAgent?.slice(0, 60) || s.id}</span>
                        <span className="text-muted-foreground">
                          {s.ipAddress ? ` · ${s.ipAddress}` : ""} · {f.dateTime(s.createdAt)} · {t("account.sessionExpires", { date: f.dateTime(s.expiresAt) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </Field>
            </dl>
          </Panel>
        ) : null}

        {user ? (
          <Panel title={t("account.methods")}>
            {user.providers.length === 0 && gameLinks.length === 0 ? <Empty>{t("account.noMethods")}</Empty> : null}
            <List>
              {user.providers.map((pr) => (
                <Row
                  key={`${pr.provider}:${pr.accountId ?? ""}`}
                  testId={`provider-${pr.provider}`}
                  actions={
                    <ReasonDialog action={removeLinkAction} hidden={{ ...hidden, provider: pr.provider }} trigger={t("account.actions.removeLink")} triggerSize="xs" testId={`action-remove-link-${pr.provider}`} title={t("account.actions.removeLinkTitle", { provider: providerName(pr.provider) })} description={t("account.actions.removeLinkDescription")} confirmLabel={t("account.actions.removeLink")} destructive />
                  }
                >
                  <span className="font-medium">{providerName(pr.provider)}</span>
                  <span className="text-xs text-muted-foreground">
                    {pr.accountId ? ` · ${pr.accountId}` : ""}
                    {pr.createdAt ? ` · ${t("account.providerSince", { date: f.date(pr.createdAt) })}` : ""}
                  </span>
                </Row>
              ))}
              {gameLinks.map(([provider, value]) => (
                <Row
                  key={provider}
                  testId={`link-${provider}`}
                  actions={
                    <ReasonDialog action={removeLinkAction} hidden={{ ...hidden, provider }} trigger={t("account.actions.removeLink")} triggerSize="xs" testId={`action-remove-link-${provider}`} title={t("account.actions.removeLinkTitle", { provider: providerName(provider) })} description={t("account.actions.removeLinkDescription")} confirmLabel={t("account.actions.removeLink")} destructive />
                  }
                >
                  <span className="font-medium">{providerName(provider)}</span>
                  <span className="text-xs text-muted-foreground"> · {value}</span>
                </Row>
              ))}
            </List>
          </Panel>
        ) : null}

        {user ? (
          <Panel title={t("account.legacy")}>
            {user.legacyLinks.length === 0 ? (
              <Empty>{t("account.noLegacy")}</Empty>
            ) : (
              <List>
                {user.legacyLinks.map((l) => (
                  <Row key={`${l.app}:${l.legacyUserId}`}>
                    <span className="font-medium">{l.app}</span>
                    <span className="text-xs text-muted-foreground">
                      {" "}
                      · {l.legacyUsername ?? l.legacyUserId}
                      {l.method || l.importedAt ? ` · ${t("account.legacyImported", { method: l.method ?? "?", date: f.date(l.importedAt) })}` : ""}
                    </span>
                  </Row>
                ))}
              </List>
            )}
          </Panel>
        ) : null}
      </div>

      <Panel title={t("account.apps")}>
        {view.apps.length === 0 ? (
          <Empty>{t("account.noApps")}</Empty>
        ) : (
          <List>
            {view.apps.map((a) => (
              <Row
                key={a.app}
                testId={`app-${a.app}`}
                actions={
                  a.url ? (
                    <a href={a.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm underline-offset-2 hover:underline" data-testid={`app-admin-${a.app}`}>
                      {t("account.openAppAdmin", { app: a.name })} <ExternalLink className="size-3" aria-hidden />
                    </a>
                  ) : (
                    <span className="text-xs text-muted-foreground">{a.note ? t("account.nakamaId", { id: a.note }) : t("account.noWebAdmin")}</span>
                  )
                }
              >
                <span className="font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground"> · {t("account.appSince", { first: f.date(a.firstSeenAt), last: f.dateTime(a.lastSeenAt) })}</span>
              </Row>
            ))}
          </List>
        )}
      </Panel>

      {p ? (
        <Panel
          title={t("account.platform")}
          actions={
            <>
              <Link href={`/dashboard/admin/wallet/${encodeURIComponent(sub)}`} className="text-sm underline-offset-2 hover:underline">
                {t("account.walletLink")}
              </Link>
              <Link href={`/dashboard/admin/abzeichen?sub=${encodeURIComponent(sub)}`} className="text-sm underline-offset-2 hover:underline">
                {t("account.syncLink")}
              </Link>
            </>
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">{t("account.level", { level: p.level.level })}</p>
              <p className="text-xl font-semibold tabular-nums">{t("account.xp", { xp: f.number(p.level.xp) })}</p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">{t("account.balance")}</p>
              <p className="text-xl font-semibold tabular-nums" data-testid="account-balance">
                {p.balance === null ? t("account.noWallet") : t("common.credits", { amount: f.number(p.balance) })}
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <p className="text-xs text-muted-foreground">{t("account.friends")}</p>
              <p className="text-xl font-semibold tabular-nums">{f.number(p.friends)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t("account.badges")}</h3>
                <div className="flex gap-2">
                  {grantable.length ? (
                    <ReasonDialog action={grantBadgeAction} hidden={hidden} trigger={<><Plus /> {t("badges.grant")}</>} triggerSize="xs" testId="action-grant-badge" title={t("badges.grant")} description={t("badges.grantDescription")} confirmLabel={t("badges.grant")}>
                      <SelectField name="badge" label={t("badges.grantPick")} options={grantable.map((b) => ({ value: b.key, label: b.title[f.locale] }))} testId="grant-badge-select" />
                    </ReasonDialog>
                  ) : null}
                  <ReasonDialog action={resyncBadgesAction} hidden={hidden} trigger={<><RefreshCw /> {t("badges.resync")}</>} triggerSize="xs" testId="action-resync" title={t("badges.resyncTitle")} description={t("badges.resyncDescription")} confirmLabel={t("badges.resync")} />
                </div>
              </div>
              {p.badges.length === 0 ? (
                <Empty>{t("account.noBadges")}</Empty>
              ) : (
                <List>
                  {p.badges.map((b) => (
                    <Row
                      key={b.key}
                      testId={`badge-${b.key}`}
                      actions={
                        <ReasonDialog action={revokeBadgeAction} hidden={{ ...hidden, badge: b.key }} trigger={t("badges.revoke")} triggerSize="xs" testId={`action-revoke-badge-${b.key}`} title={t("badges.revokeTitle", { badge: b.title })} description={t("badges.revokeDescription")} confirmLabel={t("badges.revoke")} destructive />
                      }
                    >
                      <span className="font-medium">{b.title}</span>
                      <span className="text-xs text-muted-foreground"> · {f.date(b.earnedAt)} · {t("badges.rewards", { xp: b.xp, credits: b.credits })}</span>
                      {p.sync
                        .filter((s) => s.badgeKey === b.key)
                        .map((s) => (
                          <Pill key={s.target} tone={s.status === "done" ? "success" : "neutral"}>
                            {s.target === "discord" ? t("badges.syncDiscord") : t("badges.syncTeamspeak")}: {t(`badges.syncStatus.${s.status === "done" ? "done" : "skipped"}`)}
                          </Pill>
                        ))}
                    </Row>
                  ))}
                </List>
              )}
              {p.revokedBadges.length ? <p className="mt-2 text-xs text-muted-foreground">{t("account.revokedBadges", { list: p.revokedBadges.join(", ") })}</p> : null}
              {p.pendingSyncJobs ? <p className="mt-2 text-xs text-muted-foreground">{t("badges.pendingJobs", { count: p.pendingSyncJobs })}</p> : null}
              {p.teamspeak ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  {p.teamspeak.verifiedAt ? t("badges.teamspeakLink", { nickname: p.teamspeak.nickname ?? "?" }) : t("badges.teamspeakUnverified")}
                </p>
              ) : null}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t("account.stats")}</h3>
              {p.stats.length === 0 ? (
                <Empty>{t("account.noStats")}</Empty>
              ) : (
                <dl className="max-h-72 overflow-y-auto">
                  {p.stats.map((s) => (
                    <Field key={s.key} label={<span className="font-mono text-xs">{s.key}</span>}>
                      <span className="tabular-nums">{f.number(s.value)}</span>
                    </Field>
                  ))}
                </dl>
              )}
            </div>
          </div>
        </Panel>
      ) : view.platformError ? (
        <Hint tone="warning">{t("overview.platformUnavailable")}</Hint>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t("account.hubAudit")}>
          {view.hubAudit.length === 0 ? (
            <Empty>{t("account.noHubAudit")}</Empty>
          ) : (
            <List>
              {view.hubAudit.map((e) => (
                <Row key={e.id} testId="hub-audit-row">
                  <span className="font-medium">{t.has(`audit.actions.${actionMessageKey(e.action)}`) ? t(`audit.actions.${actionMessageKey(e.action)}`) : e.action}</span>
                  {e.details.outcome === "failed" ? (
                    <>
                      {" "}
                      <Pill tone="danger">{t("audit.failed", { error: String(e.details.error ?? "?") })}</Pill>
                    </>
                  ) : null}
                  <span className="block text-xs text-muted-foreground">
                    {f.dateTime(e.createdAt)} · {e.actorName ?? e.actorSub}
                    {typeof e.details.reason === "string" ? ` · ${t("audit.reason", { reason: e.details.reason })}` : ""}
                  </span>
                </Row>
              ))}
            </List>
          )}
          <Link href={`/dashboard/admin/protokoll?target=${encodeURIComponent(sub)}`} className="mt-3 inline-block text-xs text-muted-foreground underline-offset-2 hover:underline">
            {t("nav.audit")} →
          </Link>
        </Panel>
        {user ? (
          <Panel title={t("account.authAudit")}>
            {user.audit.length === 0 ? (
              <Empty>{t("account.noAuthAudit")}</Empty>
            ) : (
              <List>
                {user.audit.slice(0, 50).map((e, i) => (
                  <Row key={e.id ?? i}>
                    <span className="font-mono text-xs">{e.action}</span>
                    {!e.success ? (
                      <>
                        {" "}
                        <Pill tone="danger">✕</Pill>
                      </>
                    ) : null}
                    <span className="block text-xs text-muted-foreground">
                      {f.dateTime(e.createdAt)}
                      {e.ipAddress ? ` · ${e.ipAddress}` : ""}
                    </span>
                  </Row>
                ))}
              </List>
            )}
          </Panel>
        ) : null}
      </div>
    </section>
  );
}
