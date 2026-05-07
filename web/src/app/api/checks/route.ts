import { runAllChecks } from "@/lib/checks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /status/api/checks
 * Returns the full CheckBundle as JSON. HTTP status mirrors the worst severity
 * so external probes (UptimeRobot etc) can monitor *features* not just liveness:
 *   all OK   → 200
 *   any WARN → 200 (warns are observational, don't page)
 *   any FAIL → 503
 */
export async function GET() {
  const bundle = await runAllChecks();
  const statusCode = bundle.summary.worst === "fail" ? 503 : 200;
  return new Response(JSON.stringify(bundle, null, 2), {
    status: statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
