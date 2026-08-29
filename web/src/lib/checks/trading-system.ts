import type { CheckFn } from "../runner";
import { query } from "../pg";

type HealthRow = {
  age_seconds: number;
  status: string;
  execution_enabled: string;
  candles: string;
  signals: string;
};

export const tradingSystemFreshness: CheckFn = async () => {
  const rows = await query<HealthRow>(
    "trading-system",
    `SELECT
       EXTRACT(EPOCH FROM (NOW() - h.last_seen_at))::float8 AS age_seconds,
       h.status,
       COALESCE((SELECT value FROM system_setting WHERE key = 'execution_enabled'), 'missing') AS execution_enabled,
       (SELECT COUNT(*)::text FROM market_candle) AS candles,
       (SELECT COUNT(*)::text FROM strategy_signal) AS signals
     FROM worker_heartbeat h
     WHERE h.worker = 'collector'`,
  );
  if (!rows.length) {
    return {
      id: "trading-system-freshness",
      group: "trading-system",
      name: "Collector + execution lock",
      status: "fail",
      detail: "no collector heartbeat",
    };
  }
  const row = rows[0];
  const healthy = row.status === "ok" && row.age_seconds < 180;
  const locked = row.execution_enabled === "false";
  return {
    id: "trading-system-freshness",
    group: "trading-system",
    name: "Collector + execution lock",
    status: !healthy ? "fail" : !locked ? "warn" : "ok",
    detail: `${Math.floor(row.age_seconds)}s old · ${row.candles} candles · ${row.signals} signals · execution ${locked ? "locked" : "ENABLED"}`,
  };
};
