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
 * Most recent OHLCV row should not be older than ~4 calendar days. The
 * cron is weekdays at 22:00 UTC; on a Monday morning UTC the latest row
 * is the prior Friday's session — already 3 days old before noon UTC.
 * 4 days is the smallest window that doesn't false-alarm over a normal
 * weekend.
 */
export const stockPriceFreshness: CheckFn = async () => {
  const rows = await query<{ ts: Date | null }>(
    "stock",
    "SELECT MAX(ingested_at) AS ts FROM price_observation",
  );
  const last = rows[0]?.ts ? new Date(rows[0].ts).getTime() : null;
  if (last === null) {
    return {
      id: "stock-price-freshness",
      group: "stock",
      name: "Price ingest",
      status: "warn",
      detail: "no price rows yet",
    };
  }
  const age = Date.now() - last;
  const STALE_MS = 4 * 86_400_000;
  return {
    id: "stock-price-freshness",
    group: "stock",
    name: "Price ingest",
    status: age > STALE_MS ? "fail" : "ok",
    detail: `last row ${fmtAgo(age)}`,
  };
};

/**
 * Same threshold rationale as the price check, applied to prediction rows.
 * The agent runs weekdays only.
 */
export const stockPredictionFreshness: CheckFn = async () => {
  const rows = await query<{ ts: Date | null }>(
    "stock",
    "SELECT MAX(generated_at) AS ts FROM prediction",
  );
  const last = rows[0]?.ts ? new Date(rows[0].ts).getTime() : null;
  if (last === null) {
    return {
      id: "stock-prediction-freshness",
      group: "stock",
      name: "Prediction freshness",
      status: "warn",
      detail: "no predictions yet — awaiting first agent run",
    };
  }
  const age = Date.now() - last;
  const STALE_MS = 4 * 86_400_000;
  return {
    id: "stock-prediction-freshness",
    group: "stock",
    name: "Prediction freshness",
    status: age > STALE_MS ? "fail" : "ok",
    detail: `last prediction ${fmtAgo(age)}`,
  };
};

/**
 * Two-signal consistency: if the agent heartbeat is fresh (cron fired and
 * the script touched the heartbeat file) but the prediction table didn't
 * gain a row, the parse-and-insert step is silently broken.
 */
export const stockAgentLoggingParity: CheckFn = async () => {
  let heartbeatMs: number | null = null;
  try {
    const stat = await fs.stat(path.join(HEARTBEAT_DIR, "stock-agent"));
    heartbeatMs = Date.now() - stat.mtimeMs;
  } catch {
    return {
      id: "stock-agent-parity",
      group: "stock",
      name: "Agent ↔ prediction parity",
      status: "warn",
      detail: "no agent heartbeat to compare against",
    };
  }

  const rows = await query<{ ts: Date | null }>(
    "stock",
    "SELECT MAX(generated_at) AS ts FROM prediction",
  );
  const last = rows[0]?.ts ? new Date(rows[0].ts).getTime() : null;
  const predictionAgeMs = last ? Date.now() - last : null;

  // Agent fires weekdays at 22:30 UTC; allow up to 28h before considering
  // the heartbeat itself stale (one missed run + buffer).
  const heartbeatFresh = heartbeatMs <= 28 * 3_600_000;

  if (!heartbeatFresh) {
    return {
      id: "stock-agent-parity",
      group: "stock",
      name: "Agent ↔ prediction parity",
      status: "ok",
      detail: `heartbeat is ${fmtAgo(heartbeatMs)} (cron not due) — parity not checked`,
    };
  }

  if (last === null) {
    return {
      id: "stock-agent-parity",
      group: "stock",
      name: "Agent ↔ prediction parity",
      status: "warn",
      detail: `heartbeat fresh (${fmtAgo(heartbeatMs)}) but no predictions ever — wait for next cron`,
    };
  }

  // If the agent fired but the prediction is ≥ 30h older than the heartbeat,
  // the JSON parse + INSERT step likely broke.
  const STALE_GAP_MS = 30 * 3_600_000;
  if (predictionAgeMs! - heartbeatMs > STALE_GAP_MS) {
    return {
      id: "stock-agent-parity",
      group: "stock",
      name: "Agent ↔ prediction parity",
      status: "fail",
      detail: `agent ran ${fmtAgo(heartbeatMs)} but last prediction is ${fmtAgo(predictionAgeMs!)} — JSON parse / insert broken`,
    };
  }

  return {
    id: "stock-agent-parity",
    group: "stock",
    name: "Agent ↔ prediction parity",
    status: "ok",
    detail: `heartbeat ${fmtAgo(heartbeatMs)} ⇄ last prediction ${fmtAgo(predictionAgeMs!)}`,
  };
};
