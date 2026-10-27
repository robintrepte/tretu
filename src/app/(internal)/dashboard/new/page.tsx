import Link from "next/link";
import { redirect } from "next/navigation";

import { CreateServerWizard } from "@/components/dashboard/create-server-wizard";
import { Hint } from "@/components/dashboard/panel";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";
import { getCloudflareConfig, getSetupStatus } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default async function DashboardNewInstancePage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/new");
  if (!hasPermission(userId, "instances:create")) redirect("/dashboard");

  const setup = getSetupStatus();

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Neuer Server</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Spiel wählen, Version und Größe festlegen – Hetzner-VM, Speicher, Firewall, Docker und DNS richtet das Dashboard
          automatisch ein.
        </p>
      </div>
      {!setup.ready ? (
        <Hint tone="warning">
          Hetzner ist noch nicht verbunden.{" "}
          {hasPermission(userId, "settings:manage") ? (
            <Link href="/dashboard/setup" className="font-medium underline">
              Jetzt einrichten
            </Link>
          ) : (
            "Bitte einen Admin, die Einrichtung abzuschließen."
          )}
        </Hint>
      ) : (
        <CreateServerWizard
          cloudflareDomain={setup.cloudflare ? (getCloudflareConfig()?.domain ?? null) : null}
          curseforgeAvailable={setup.curseforge}
        />
      )}
    </section>
  );
}
