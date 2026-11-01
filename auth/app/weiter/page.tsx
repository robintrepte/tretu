import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AuthShell } from "@/components/auth-shell"
import { ContinueStep } from "@/components/auth/flow-forms"
import { readOAuthRequest, toQueryString, type SearchParams } from "@/lib/oidc/flow"
import { requireUser } from "@/lib/session"
import { isAdmin } from "@/lib/users"

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("continuePage"))("continue") }
}

/** Steps between sign-in and the app: pick a new username (legacy conflicts), admins turn on 2FA. */
export default async function ContinuePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const query = toQueryString(params)
  const oauth = await readOAuthRequest(params)
  const { user } = await requireUser()
  if (!oauth?.valid) redirect("/konto")
  const t = await getTranslations("continuePage")
  const needs2fa = isAdmin(user.roles) && !user.twoFactorEnabled
  const title = user.usernamePending ? t("usernameTitle") : needs2fa ? t("adminTitle") : t("continue")
  return (
    <AuthShell title={title}>
      <ContinueStep
        usernamePending={user.usernamePending}
        suggestedUsername={user.displayUsername ?? user.username ?? ""}
        needs2fa={needs2fa}
        securityHref={`/konto?tab=sicherheit&weiter=${encodeURIComponent(query)}`}
      />
    </AuthShell>
  )
}
