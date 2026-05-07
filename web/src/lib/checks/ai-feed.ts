import { promises as fs } from "fs";
import path from "path";
import type { CheckFn } from "../runner";

const DIGEST_DIR = process.env.DIGEST_DIR ?? "/data/ai-feed/digest";

function fmtAgoHours(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60_000)}m ago`;
  if (h < 48) return `${h.toFixed(1)}h ago`;
  return `${(h / 24).toFixed(1)}d ago`;
}

/**
 * Latest digest file age. Cron is 12h cadence (00:13 / 12:13 UTC); allow ~2h
 * grace before WARN, full slot miss before FAIL.
 */
export const digestFreshness: CheckFn = async () => {
  let entries: string[];
  try {
    entries = await fs.readdir(DIGEST_DIR);
  } catch {
    return {
      id: "ai-feed-digest",
      group: "ai-feed",
      name: "Latest digest",
      status: "fail",
      detail: `cannot read ${DIGEST_DIR}`,
    };
  }
  const jsons = entries.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (jsons.length === 0) {
    return {
      id: "ai-feed-digest",
      group: "ai-feed",
      name: "Latest digest",
      status: "fail",
      detail: "no digest files found",
    };
  }
  const latest = jsons.at(-1)!;
  const stat = await fs.stat(path.join(DIGEST_DIR, latest));
  const ageMs = Date.now() - stat.mtimeMs;
  const ageHours = ageMs / 3_600_000;
  return {
    id: "ai-feed-digest",
    group: "ai-feed",
    name: "Latest digest",
    status: ageHours > 30 ? "fail" : ageHours > 14 ? "warn" : "ok",
    detail: `${latest} updated ${fmtAgoHours(ageMs)}`,
  };
};

/**
 * Did the agent produce all three artifacts (md, json, zh.json) for today?
 * Useful catch for "budget cap killed the run mid-write" failures.
 */
export const digestCompleteness: CheckFn = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const required = [`${today}.md`, `${today}.json`, `${today}.zh.json`];
  const results = await Promise.all(
    required.map(async (f) => {
      try {
        await fs.access(path.join(DIGEST_DIR, f));
        return { f, present: true };
      } catch {
        return { f, present: false };
      }
    }),
  );
  const missing = results.filter((r) => !r.present).map((r) => r.f);
  // Before the morning slot fires there's nothing for today — that's not a failure.
  const nowUtcHour = new Date().getUTCHours();
  const expectMorning = nowUtcHour >= 1; // 00:13 UTC cron, give it a few minutes grace
  if (missing.length === required.length && !expectMorning) {
    return {
      id: "ai-feed-today",
      group: "ai-feed",
      name: "Today's artifacts",
      status: "ok",
      detail: "morning slot hasn't fired yet",
    };
  }
  if (missing.length === 0) {
    return {
      id: "ai-feed-today",
      group: "ai-feed",
      name: "Today's artifacts",
      status: "ok",
      detail: `${today} md + json + zh.json all present`,
    };
  }
  return {
    id: "ai-feed-today",
    group: "ai-feed",
    name: "Today's artifacts",
    status: missing.length === required.length ? "fail" : "warn",
    detail: `missing: ${missing.join(", ")}`,
  };
};

