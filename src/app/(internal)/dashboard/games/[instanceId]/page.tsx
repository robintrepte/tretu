import { notFound, redirect } from "next/navigation";

import { InstanceManager } from "@/components/dashboard/instance/instance-manager";
import { getUserId } from "@/lib/auth/session";
import { getInstanceDetail } from "@/lib/dashboard/view";
import { getPermissions } from "@/lib/permissions/checks";
import { getSetupStatus } from "@/lib/settings/store";

export const dynamic = "force-dynamic";

export default async function GameDetailPage({ params }: { params: Promise<{ instanceId: string }> }) {
  const userId = await getUserId();
  if (!userId) redirect("/login?callbackUrl=/dashboard");

  const instanceId = Number((await params).instanceId);
  if (!Number.isInteger(instanceId)) notFound();
  const detail = await getInstanceDetail(instanceId);
  if (!detail) notFound();

  return (
    <InstanceManager
      initial={detail}
      permissions={getPermissions(userId)}
      curseforgeAvailable={getSetupStatus().curseforge}
    />
  );
}
