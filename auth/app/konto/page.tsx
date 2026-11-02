import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AccountHeader } from "@/components/account/account-header"
import { AppsOverview } from "@/components/account/apps-overview"
import { ConnectionsSection } from "@/components/account/connections-section"
import { LanguageSection } from "@/components/account/language-section"
import { LegacySection } from "@/components/account/legacy-section"
import { PrivacySection } from "@/components/account/privacy-section"
import { ProfileSection } from "@/components/account/profile-section"
import { SecuritySection } from "@/components/account/security-section"
import { SiteFooter } from "@/components/site-footer"
import { Alert } from "@/components/ui/alert"
import { loadAccountData } from "@/lib/account-data"
import { enabledSocialProviders, env, steamEnabled } from "@/lib/env"
import { isPlaceholderEmail } from "@/lib/oidc/claims"
import { readOAuthRequest, type SearchParams } from "@/lib/oidc/flow"
import { requireUser } from "@/lib/session"
import { cn } from "@/lib/utils"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("account"))("title") }
}

const TABS = ["profil", "sicherheit", "konten", "sprache", "datenschutz", "alte-konten"] as const
type Tab = (typeof TABS)[number]

export default async function AccountPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const { session, user } = await requireUser()
  const t = await getTranslations("account")
  const tab: Tab = TABS.includes(params.tab as Tab) ? (params.tab as Tab) : "profil"

  // "weiter" carries an app sign-in that paused for 2FA setup; it resumes on /weiter.
  const weiter = typeof params.weiter === "string" ? params.weiter : null
  const resume = weiter && (await readOAuthRequest(Object.fromEntries(new URLSearchParams(weiter))))?.valid ? `/weiter?${weiter}` : null

  const { gameLinks, passkeys, activity, legacy, hasPassword, providers, admin, renameAt, firstImport, claimOpen, claimUntil } = await loadAccountData(user, tab === "sicherheit")
  return (
    <div className="flex min-h-dvh flex-col">
      <AccountHeader name={user.name} image={user.image} username={user.displayUsername ?? user.username ?? ""} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-10 pt-6 sm:pt-10">
        <div className="mb-6">
          <h1 className="text-3xl font-semibold tracking-tight">{t("hello", { name: user.name })}</h1>
          <p className="mt-1 text-muted-foreground">{t("subtitle")}</p>
        </div>

        <div className="mb-6 space-y-3">
          {params.verified === "1" && <Alert tone="success">{(await getTranslations("login"))("notices.verified")}</Alert>}
          {resume && tab === "sicherheit" && user.twoFactorEnabled && (
            <Alert tone="success">
              <Link href={resume as "/weiter"} className="font-medium underline">
                {(await getTranslations("continuePage"))("continue")}
              </Link>
            </Alert>
          )}
          {admin && !user.twoFactorEnabled && (
            <Alert tone="error">
              {t("adminBanner")}{" "}
              <Link href="/konto?tab=sicherheit" className="font-medium underline">
                {t("adminBannerAction")}
              </Link>
            </Alert>
          )}
          {user.usernamePending && (
            <Alert>
              {t("usernameBanner")}{" "}
              <Link href="/konto?tab=profil#username" className="font-medium underline">
                {t("usernameBannerAction")}
              </Link>
            </Alert>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-[220px_1fr]">
          <nav aria-label={t("title")} className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:flex-col md:px-0">
            {TABS.map((id) => (
              <Link
                key={id}
                href={`/konto?tab=${id}`}
                aria-current={id === tab ? "page" : undefined}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-[15px] transition-colors",
                  id === tab ? "bg-card font-medium text-foreground shadow-sm ring-1 ring-border" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {t(`tabs.${id}`)}
              </Link>
            ))}
          </nav>

          <div className="min-w-0 space-y-6">
            {tab === "profil" && (
              <>
                <ProfileSection
                  username={user.displayUsername ?? user.username ?? ""}
                  name={user.name}
                  image={user.image}
                  email={isPlaceholderEmail(user.email) ? null : user.email}
                  emailVerified={user.emailVerified}
                  usernamePending={user.usernamePending}
                  renameAt={renameAt}
                />
                <AppsOverview />
              </>
            )}
            {tab === "sicherheit" && (
              <SecuritySection
                hasPassword={hasPassword}
                needsEmail={isPlaceholderEmail(user.email)}
                twoFactorEnabled={Boolean(user.twoFactorEnabled)}
                isAdmin={admin}
                passkeys={passkeys.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt?.toISOString() ?? null }))}
                currentSessionId={session.session.id}
                activity={activity.map((a) => ({ ...a, createdAt: a.createdAt.toISOString(), meta: a.meta ?? null }))}
              />
            )}
            {tab === "konten" && (
              <ConnectionsSection
                enabled={enabledSocialProviders}
                steamEnabled={steamEnabled}
                linked={providers}
                hasPasskey={passkeys.length > 0}
                hasPassword={hasPassword}
                games={gameLinks.map((g) => ({ provider: g.provider as "minecraft" | "teamspeak", id: g.id, displayName: g.displayName }))}
                linkUrls={{ minecraft: env.TRETU_MC_LINK_URL, teamspeak: env.TRETU_TS_LINK_URL }}
                notice={typeof params.error === "string" ? params.error.slice(0, 80) : null}
              />
            )}
            {tab === "sprache" && <LanguageSection locale={user.locale === "en" ? "en" : "de"} />}
            {tab === "datenschutz" && <PrivacySection username={user.displayUsername ?? user.username ?? ""} hasPassword={hasPassword} />}
            {tab === "alte-konten" && (
              <LegacySection
                connected={legacy.map((l) => ({ app: l.app, name: l.legacyUsername ?? l.legacyEmail ?? "–" }))}
                until={firstImport ? claimUntil : null}
                open={claimOpen}
                providers={[...enabledSocialProviders.filter((p) => p !== "apple"), ...(steamEnabled ? (["steam"] as const) : [])]}
                notice={typeof params.claim === "string" ? params.claim : null}
              />
            )}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
