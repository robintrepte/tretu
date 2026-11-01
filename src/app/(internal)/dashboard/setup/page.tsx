import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { SetupPanel } from "@/components/dashboard/setup-panel";
import { getUserId } from "@/lib/auth/session";
import { hasPermission } from "@/lib/permissions/checks";
import { getSetupSnapshot } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default async function DashboardSetupPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard/setup");
  if (!(await hasPermission(userId, "settings:manage"))) redirect("/dashboard");

  const [snapshot, t] = await Promise.all([getSetupSnapshot(), getTranslations("dashboard.setup")]);

  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("title")}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">{t("intro")}</p>
      </div>
      <SetupPanel initial={snapshot} />
    </section>
  );
}
