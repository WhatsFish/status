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

type ResearchRow = {
  symbols: string;
  daily_rows: string;
  backtests: string;
  basis_symbols: string;
  basis_age_seconds: number | null;
  shadow_age_seconds: number | null;
};

export const tradingSystemResearch: CheckFn = async () => {
  const rows = await query<ResearchRow>(
    "trading-system",
    `SELECT
       (SELECT COUNT(DISTINCT symbol)::text FROM underlying_daily) AS symbols,
       (SELECT COUNT(*)::text FROM underlying_daily) AS daily_rows,
       (SELECT COUNT(*)::text FROM backtest_result) AS backtests,
       (SELECT COUNT(DISTINCT instrument)::text FROM basis_snapshot) AS basis_symbols,
       (SELECT EXTRACT(EPOCH FROM (NOW() - MAX(ts)))::float8 FROM basis_snapshot) AS basis_age_seconds,
       (SELECT EXTRACT(EPOCH FROM (NOW() - MAX(ts)))::float8 FROM shadow_equity_snapshot) AS shadow_age_seconds`,
  );
  const row = rows[0];
  const coverage =
    Number(row.symbols) >= 14 &&
    Number(row.daily_rows) >= 14_000 &&
    Number(row.backtests) >= 42 &&
    Number(row.basis_symbols) >= 14;
  const basisFresh =
    row.basis_age_seconds !== null && row.basis_age_seconds < 1_200;
  const shadowFresh =
    row.shadow_age_seconds !== null && row.shadow_age_seconds < 2_700;
  return {
    id: "trading-system-research",
    group: "trading-system",
    name: "Underlying + research data",
    status: !coverage || !shadowFresh ? "fail" : !basisFresh ? "warn" : "ok",
    detail: `${row.symbols} symbols · ${row.daily_rows} daily rows · ${row.backtests} backtests · basis ${Math.floor(row.basis_age_seconds ?? 0)}s · shadow ${Math.floor(row.shadow_age_seconds ?? 0)}s`,
  };
};
