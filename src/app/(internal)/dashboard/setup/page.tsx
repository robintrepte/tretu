import { redirect } from "next/navigation";

import { SetupPanel } from "@/components/dashboard/setup-panel";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";
import { getCloudflareConfig, getDefaultLocation, getSetupStatus, getSshCredentials } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default async function DashboardSetupPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/setup");
  if (!hasPermission(userId, "settings:manage")) redirect("/dashboard");

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Einrichtung</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Einmalig Hetzner verbinden – danach läuft alles aus dem Dashboard. Cloudflare und CurseForge sind optional.
        </p>
      </div>
      <SetupPanel
        initial={{
          status: getSetupStatus(),
          defaultLocation: getDefaultLocation(),
          cloudflareDomain: getCloudflareConfig()?.domain ?? null,
          sshPublicKey: getSshCredentials()?.publicKey ?? null,
        }}
      />
    </section>
  );
}
