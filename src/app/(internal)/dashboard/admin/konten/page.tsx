import { Search } from "lucide-react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";

import { AccountLink, Empty, PageHeader, Pill } from "@/components/admin/ui";
import { Hint, Panel } from "@/components/dashboard/panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { requireAccountAdminPage } from "@/lib/admin/access";
import { ACTOR_ERRORS, authAdmin, AuthAdminError, type AdminSearchResult } from "@/lib/admin/auth-admin";
import { adminFormat } from "@/lib/admin/format";

export const dynamic = "force-dynamic";

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ q?: string; cursor?: string }> }) {
  const actor = await requireAccountAdminPage();
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 200);
  const cursor = (params.cursor ?? "").slice(0, 500) || null;
  const [t, f] = await Promise.all([getTranslations("admin"), adminFormat()]);

  let result: AdminSearchResult | null = null;
  let error: AuthAdminError["code"] | null = null;
  let detail: string | null = null;
  if (q) {
    try {
      result = await authAdmin.search(actor.sub, q, { cursor, limit: 50 });
    } catch (e) {
      if (!(e instanceof AuthAdminError)) throw e;
      error = e.code;
      detail = e.detail;
    }
  }

  return (
    <section className="space-y-6">
      <PageHeader title={t("accounts.title")} intro={t("accounts.intro")} />
      <form method="get" className="flex flex-wrap gap-2" role="search">
        <label htmlFor="admin-search" className="sr-only">
          {t("accounts.searchLabel")}
        </label>
        <Input
          id="admin-search"
          name="q"
          defaultValue={q}
          placeholder={t("accounts.searchPlaceholder")}
          className="h-10 max-w-xl flex-1 rounded-xl"
          autoComplete="off"
          autoFocus
          data-testid="account-search"
        />
        <Button type="submit" className="h-10 rounded-xl bg-[var(--tretu-accent)] text-white hover:bg-[var(--tretu-accent-hover)]">
          <Search /> {t("accounts.search")}
        </Button>
      </form>

      {error ? (
        <Hint tone="danger">
          {t(`errors.auth.${error}`)}
          {detail && error !== "unavailable" && !ACTOR_ERRORS.has(error) ? ` ${t("errors.detail", { detail })}` : null}
        </Hint>
      ) : null}

      {!q ? <Empty>{t("accounts.hint")}</Empty> : null}

      {result ? (
        <Panel title={t("accounts.results", { count: result.items.length })}>
          {result.items.length === 0 ? (
            <Empty>{t("accounts.empty")}</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm" data-testid="account-results">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 font-medium">{t("accounts.columns.account")}</th>
                    <th className="py-2 font-medium">{t("accounts.columns.email")}</th>
                    <th className="py-2 font-medium">{t("accounts.columns.created")}</th>
                    <th className="py-2 font-medium">{t("accounts.columns.lastSignIn")}</th>
                    <th className="py-2 font-medium">{t("accounts.columns.flags")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {result.items.map((u) => (
                    <tr key={u.sub}>
                      <td className="max-w-[16rem] py-2.5 pr-3">
                        <div className="flex items-center gap-3">
                          {u.picture ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={u.picture} alt="" className="size-8 shrink-0 rounded-full" />
                          ) : (
                            <div className="size-8 shrink-0 rounded-full bg-muted" />
                          )}
                          <AccountLink sub={u.sub} name={u.name || u.username} secondary={u.username ? `@${u.username}` : u.sub} />
                        </div>
                      </td>
                      <td className="max-w-[14rem] truncate py-2.5 pr-3 text-muted-foreground">{u.email ?? t("common.none")}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{f.date(u.createdAt)}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{u.lastSignInAt ? f.dateTime(u.lastSignInAt) : t("common.never")}</td>
                      <td className="py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {u.roles.includes("admin") ? <Pill tone="accent">{t("accounts.flags.admin")}</Pill> : null}
                          {u.twoFactor ? <Pill>{t("accounts.flags.twoFactor")}</Pill> : null}
                          {u.locked ? <Pill tone="danger">{t("accounts.flags.locked")}</Pill> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {result.nextCursor ? (
            <div className="mt-4">
              <Button asChild variant="outline" size="sm" className="rounded-xl">
                <Link href={`/dashboard/admin/konten?${new URLSearchParams({ q, cursor: result.nextCursor }).toString()}`}>{t("common.more")}</Link>
              </Button>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </section>
  );
}
