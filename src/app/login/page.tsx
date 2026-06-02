import type { Metadata } from "next";

import { DiscordLoginButton } from "@/components/auth/discord-login-button";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Anmelden",
  description: "Anmeldung für das interne Tretu-Dashboard.",
  path: "/login",
});

function safeCallbackUrl(callbackUrl?: string): string {
  if (!callbackUrl) return "/dashboard";
  return callbackUrl.startsWith("/") ? callbackUrl : "/dashboard";
}

function getAuthErrorMessage(error?: string): string | null {
  if (!error) return null;

  const code = error.toLowerCase();
  if (code === "discord" || code === "oauthsignin" || code === "oauthcallback") {
    return "Die Discord-Anmeldung konnte nicht gestartet werden. Bitte prüfe Discord Client-ID, Secret und Redirect-URL.";
  }
  if (code === "oauthaccountnotlinked") {
    return "Dieses Konto ist bereits mit einer anderen Anmeldemethode verknüpft.";
  }
  if (code === "accessdenied") {
    return "Der Zugriff wurde abgelehnt.";
  }
  if (code === "configuration") {
    return "Die Anmeldung ist aktuell nicht korrekt konfiguriert.";
  }
  if (code === "callback") {
    return "Beim Abschluss der Anmeldung ist ein Fehler aufgetreten.";
  }
  if (code === "verification") {
    return "Die Verifizierung ist fehlgeschlagen.";
  }

  return `Anmeldung fehlgeschlagen (${error}).`;
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;
  const target = safeCallbackUrl(callbackUrl);
  const errorMessage = getAuthErrorMessage(error);

  return (
    <div className="mx-auto flex max-w-[1200px] items-center justify-center px-4 py-20 md:px-6 md:py-28 lg:px-8">
      <div className="w-full max-w-md p-2 sm:p-4">
        <h1 className="text-center text-2xl font-semibold tracking-tight">Anmelden</h1>
        <p className="mt-3 text-center text-sm text-muted-foreground leading-relaxed">
          Nur für Team-Leute mit Discord-Konto und den passenden Rechten. Danach kommst du ins interne Dashboard.
        </p>

        {errorMessage ? (
          <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {errorMessage} Bitte versuche es erneut.
          </p>
        ) : null}

        <div className="mt-6 space-y-2">
          <DiscordLoginButton callbackUrl={target} />
          <p className="text-center text-xs text-muted-foreground">
            Es wird eine normale Anmeldesitzung gespeichert. Ohne die richtige Freigabe im Team siehst du keine Inhalte.
          </p>
        </div>
      </div>
    </div>
  );
}
