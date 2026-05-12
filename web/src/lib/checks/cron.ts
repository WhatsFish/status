import { promises as fs } from "fs";
import path from "path";
import type { CheckFn } from "../runner";

const HEARTBEAT_DIR = process.env.HEARTBEAT_DIR ?? "/data/heartbeats";

/** Each cron entry appends `&& touch $HEARTBEAT_DIR/<name>` so the file's
 * mtime advances only on successful completion. WARN/FAIL thresholds are
 * keyed off the expected interval — well past the cadence means missed run. */
type Job = {
  id: string;        // matches the heartbeat filename
  name: string;      // human label
  schedule: string;  // human label for cron expression (display only)
  warnAfterMs: number;
  failAfterMs: number;
};

const M = 60_000;
const H = 60 * M;
const D = 24 * H;

const JOBS: Job[] = [
  {
    id: "goaccess",
    name: "goaccess report (*/5)",
    schedule: "every 5 min",
    warnAfterMs: 15 * M,
    failAfterMs: 30 * M,
  },
  {
    id: "ai-feed-agent",
    name: "ai-feed agent (00:13 / 12:13 UTC)",
    schedule: "every 12h",
    warnAfterMs: 14 * H,
    failAfterMs: 26 * H,
  },
  {
    id: "ai-feed-prune",
    name: "ai-feed prune (03:23 UTC)",
    schedule: "daily",
    warnAfterMs: 28 * H,
    failAfterMs: 48 * H,
  },
  {
    id: "ai-feed-warm-rsshub",
    name: "ai-feed RSSHub warmer (00:08 / 12:08 UTC)",
    schedule: "every 12h",
    warnAfterMs: 14 * H,
    failAfterMs: 26 * H,
  },
  {
    id: "docker-builder-prune",
    name: "docker builder prune (Sun 04:37 UTC)",
    schedule: "weekly",
    warnAfterMs: 8 * D,
    failAfterMs: 14 * D,
  },
  {
    id: "stock-prices",
    name: "stock prices (Mon-Fri 22:00 UTC)",
    schedule: "weekdays",
    // Friday close → Monday close = ~3 days. Allow 4 before failing.
    warnAfterMs: 28 * H,
    failAfterMs: 4 * D,
  },
  {
    id: "stock-news",
    name: "stock news (every 4h)",
    schedule: "every 4h",
    warnAfterMs: 5 * H,
    failAfterMs: 10 * H,
  },
  {
    id: "stock-agent",
    name: "stock agent (Mon-Fri 22:30 UTC)",
    schedule: "weekdays",
    warnAfterMs: 28 * H,
    failAfterMs: 4 * D,
  },
  {
    id: "youtube-clips-cleanup",
    name: "youtube-clips cleanup (05:30 UTC)",
    schedule: "daily",
    warnAfterMs: 28 * H,
    failAfterMs: 48 * H,
  },
  {
    id: "youtube-clips-discover-topics",
    name: "youtube-clips topic discovery (09:00 UTC)",
    schedule: "daily",
    warnAfterMs: 28 * H,
    failAfterMs: 48 * H,
  },
];

function fmtAgo(ms: number): string {
  if (ms < M) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < H) return `${Math.floor(ms / M)}m ago`;
  if (ms < D) return `${(ms / H).toFixed(1)}h ago`;
  return `${(ms / D).toFixed(1)}d ago`;
}

function makeCheck(job: Job): CheckFn {
  return async () => {
    const file = path.join(HEARTBEAT_DIR, job.id);
    try {
      const stat = await fs.stat(file);
      const age = Date.now() - stat.mtimeMs;
      const status = age > job.failAfterMs ? "fail" : age > job.warnAfterMs ? "warn" : "ok";
      return {
        id: `cron-${job.id}`,
        group: "cron",
        name: job.name,
        status,
        detail: `last success ${fmtAgo(age)} (${job.schedule})`,
      };
    } catch {
      return {
        id: `cron-${job.id}`,
        group: "cron",
        name: job.name,
        status: "fail",
        detail: `no heartbeat file at ${file}`,
      };
    }
  };
}

export const cronChecks: CheckFn[] = JOBS.map(makeCheck);
