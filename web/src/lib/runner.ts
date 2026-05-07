import type { CheckBundle, CheckResult, Severity } from "@/types/check";

export type CheckFn = () => Promise<Omit<CheckResult, "durationMs">>;

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Runs a check with a timeout. On timeout or unhandled error, emits a FAIL
 * result rather than throwing — so one bad probe never breaks the page.
 */
export async function runOne(fn: CheckFn, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CheckResult> {
  const started = Date.now();
  let timer: NodeJS.Timeout | null = null;
  try {
    const result = await Promise.race<Omit<CheckResult, "durationMs">>([
      fn(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
    return { ...result, durationMs: Date.now() - started };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      id: "unknown",
      group: "unknown",
      name: "(check threw)",
      status: "fail",
      detail: msg.slice(0, 200),
      durationMs: Date.now() - started,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

const SEV_RANK: Record<Severity, number> = { ok: 0, warn: 1, fail: 2 };

export function summarize(results: CheckResult[]): CheckBundle {
  const summary = results.reduce(
    (acc, r) => ({ ...acc, [r.status]: acc[r.status] + 1, total: acc.total + 1 }),
    { ok: 0, warn: 0, fail: 0, total: 0 } as { ok: number; warn: number; fail: number; total: number },
  );
  const worst: Severity = results.reduce<Severity>(
    (worstSoFar, r) => (SEV_RANK[r.status] > SEV_RANK[worstSoFar] ? r.status : worstSoFar),
    "ok",
  );
  return {
    summary: { ...summary, worst, generatedAt: new Date().toISOString() },
    results,
  };
}
