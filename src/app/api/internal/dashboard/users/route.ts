import { requirePermission } from "@/lib/api/guard";
import { ok } from "@/lib/api/respond";
import { listTeamMembers } from "@/lib/dashboard/team";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requirePermission("roles:manage");
  if (guard.error) return guard.error;
  return ok(await listTeamMembers());
}
