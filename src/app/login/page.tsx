import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { LoginButtons } from "@/components/auth/login-buttons";
import { getLoginProviders } from "@/lib/auth/config";
import { translatedMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return translatedMetadata("login", "/login", { noIndex: true });
}

/** Only same-site relative paths (no `//host` or scheme) are accepted as post-login targets. */
function safeCallbackUrl(callbackUrl?: string): string {
  if (!callbackUrl || !callbackUrl.startsWith("/") || callbackUrl.startsWith("//") || callbackUrl.startsWith("/\\")) {
    return "/dashboard";
  }
  return callbackUrl;
}

const KNOWN_ERRORS = new Set([
  "access_denied",
  "account_not_linked",
  "unable_to_link_account",
  "account_already_linked_to_different_user",
  "email_not_found",
  "email_not_verified",
  "state_mismatch",
  "please_restart_the_process",
  "invalid_code",
  "unable_to_get_user_info",
  "oauth_provider_not_found",
  "signup_disabled",
]);

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const t = await getTranslations("login");
  const providers = getLoginProviders();
  const target = safeCallbackUrl(callbackUrl);
  const code = error?.toLowerCase();
  const errorMessage = code
    ? KNOWN_ERRORS.has(code)
      ? t(`errors.${code}`)
      : t("errors.generic", { code: code.slice(0, 60) })
    : null;

  return (
    <div className="mx-auto flex max-w-[1200px] items-center justify-center px-4 py-20 md:px-6 md:py-28 lg:px-8">
      <div className="w-full max-w-md p-2 sm:p-4">
        <h1 className="text-center text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="mt-3 text-center text-sm text-muted-foreground leading-relaxed">
          {providers.tretu ? t("introTretu") : t("intro")}
        </p>

        {errorMessage ? (
          <p
            className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {errorMessage} {t("tryAgain")}
          </p>
        ) : null}

        <div className="mt-6 space-y-2">
          <LoginButtons callbackUrl={target} tretu={providers.tretu} discord={providers.discord} />
          <p className="text-center text-xs text-muted-foreground">{t("sessionNote")}</p>
        </div>
      </div>
    </div>
  );
}
