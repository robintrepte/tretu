import { parseId, requirePermission } from "@/lib/api/guard";
import { fail, ok } from "@/lib/api/respond";
import { getJobLog } from "@/lib/dashboard/view";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; jobId: string }> }) {
  const guard = await requirePermission("dashboard:view");
  if (guard.error) return guard.error;
  const resolved = await params;
  const id = parseId(resolved.id);
  const jobId = parseId(resolved.jobId);
  if (!id || !jobId) return fail("Ungültige ID", 400);
  const job = getJobLog(jobId, id);
  if (!job) return fail("Job nicht gefunden.", 404);
  return ok(job);
}
