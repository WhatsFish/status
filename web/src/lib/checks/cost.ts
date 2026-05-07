import { promises as fs } from "fs";
import path from "path";
import { query } from "../pg";
import type { CheckFn } from "../runner";

const HEARTBEAT_DIR = process.env.HEARTBEAT_DIR ?? "/data/heartbeats";

function fmtAgo(ms: number): string {
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h ago`;
  return `${(ms / 86_400_000).toFixed(1)}d ago`;
}

/**
 * Two-signal consistency check. We have two independent signals that the
 * agent ran successfully:
 *   1. heartbeat file mtime (touched by run-agent.sh on success)
 *   2. cost_event row insert (also done by run-agent.sh on success)
 *
 * If the heartbeat is fresh but the cost row is stale, the cost-logging
 * sub-step is broken (DB creds rotated, schema dropped, etc) — the agent
 * itself is fine, but we've stopped seeing $ data. Catch that drift
 * before it costs us a month of blind spend.
 */
export const agentCostLoggingParity: CheckFn = async () => {
  // Read heartbeat age.
  let heartbeatMs: number | null = null;
  try {
    const stat = await fs.stat(path.join(HEARTBEAT_DIR, "ai-feed-agent"));
    heartbeatMs = Date.now() - stat.mtimeMs;
  } catch {
    return {
      id: "cost-logging-parity",
      group: "cost",
      name: "Agent cost-logging parity",
      status: "warn",
      detail: "no agent heartbeat to compare against",
    };
  }

  const rows = await query<{ ts: Date | null }>(
    "cost",
    "SELECT MAX(ts) AS ts FROM cost_event WHERE service = 'claude-code-agent'",
  );
  const last = rows[0]?.ts ? new Date(rows[0].ts).getTime() : null;
  const costAgeMs = last ? Date.now() - last : null;

  // Allow up to 30h between cost rows (the cron is 12h; 14h grace × bit more).
  const STALE_MS = 30 * 3_600_000;
  // If the agent has never produced both signals (fresh deploy), don't alarm.
  const heartbeatFresh = heartbeatMs <= 14 * 3_600_000;

  if (!heartbeatFresh) {
    return {
      id: "cost-logging-parity",
      group: "cost",
      name: "Agent cost-logging parity",
      status: "ok",
      detail: `agent heartbeat is ${fmtAgo(heartbeatMs)} (cron not due) — parity not checked`,
    };
  }

  if (last === null) {
    return {
      id: "cost-logging-parity",
      group: "cost",
      name: "Agent cost-logging parity",
      // No cost rows yet at all. If instrumentation was just deployed, this
      // is normal until the next agent firing. WARN, not FAIL.
      status: "warn",
      detail: `heartbeat fresh (${fmtAgo(heartbeatMs)}) but no claude-code-agent rows ever — wait for next cron`,
    };
  }

  if (costAgeMs! > STALE_MS) {
    return {
      id: "cost-logging-parity",
      group: "cost",
      name: "Agent cost-logging parity",
      status: "fail",
      detail: `agent ran ${fmtAgo(heartbeatMs)} but last cost row is ${fmtAgo(costAgeMs!)} — logging broken`,
    };
  }

  return {
    id: "cost-logging-parity",
    group: "cost",
    name: "Agent cost-logging parity",
    status: "ok",
    detail: `heartbeat ${fmtAgo(heartbeatMs)} ⇄ last cost row ${fmtAgo(costAgeMs!)}`,
  };
};

/**
 * Total cost over the last 30 days. Pure observation — never failing,
 * just an at-a-glance number on the page so you don't need to click into
 * /cost for the bottom line.
 */
export const recentSpend: CheckFn = async () => {
  const rows = await query<{ total: string | null; events: string }>(
    "cost",
    "SELECT SUM(cost_usd)::text AS total, COUNT(*)::text AS events FROM cost_event WHERE ts > NOW() - INTERVAL '30 days'",
  );
  const total = parseFloat(rows[0]?.total ?? "0") || 0;
  const events = parseInt(rows[0]?.events ?? "0", 10);
  return {
    id: "cost-30d",
    group: "cost",
    name: "Spend last 30 days",
    status: "ok",
    detail: `$${total.toFixed(2)} across ${events} event${events === 1 ? "" : "s"}`,
  };
};
