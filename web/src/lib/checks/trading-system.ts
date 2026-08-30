import type { CheckFn } from "../runner";
import { query } from "../pg";

type HealthRow = {
  age_seconds: number;
  status: string;
  execution_enabled: string;
  candles: string;
  signals: string;
  live_age_seconds: number | null;
  live_status: string | null;
};

export const tradingSystemFreshness: CheckFn = async () => {
  const rows = await query<HealthRow>(
    "trading-system",
    `SELECT
       EXTRACT(EPOCH FROM (NOW() - h.last_seen_at))::float8 AS age_seconds,
       h.status,
       COALESCE((SELECT value FROM system_setting WHERE key = 'execution_enabled'), 'missing') AS execution_enabled,
       (SELECT EXTRACT(EPOCH FROM (NOW() - last_seen_at))::float8
        FROM worker_heartbeat WHERE worker = 'live-controller') AS live_age_seconds,
       (SELECT status FROM worker_heartbeat
        WHERE worker = 'live-controller') AS live_status,
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
  const liveHealthy =
    row.live_status === "ok" &&
    row.live_age_seconds !== null &&
    row.live_age_seconds < 180;
  return {
    id: "trading-system-freshness",
    group: "trading-system",
    name: "Collector + execution lock",
    status: !healthy || (!locked && !liveHealthy) ? "fail" : "ok",
    detail: `${Math.floor(row.age_seconds)}s old · ${row.candles} candles · ${row.signals} signals · execution ${locked ? "locked" : "LIVE"}${locked ? "" : ` · controller ${Math.floor(row.live_age_seconds ?? 0)}s`}`,
  };
};

type ResearchRow = {
  symbols: string;
  daily_rows: string;
  backtests: string;
  basis_symbols: string;
  basis_age_seconds: number | null;
  experiments: string;
  candidates: string;
  experiment_age_seconds: number | null;
  live_experiments: string;
  closed_experiments: string;
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
       (SELECT COUNT(*)::text FROM strategy_experiment
        WHERE run_id = (
          SELECT run_id FROM strategy_experiment
          ORDER BY generated_at DESC LIMIT 1
        )) AS experiments,
       (SELECT COUNT(*)::text FROM strategy_candidate) AS candidates,
       (SELECT EXTRACT(EPOCH FROM (NOW() - MAX(generated_at)))::float8
        FROM strategy_experiment) AS experiment_age_seconds,
       (SELECT COUNT(*)::text FROM live_experiment) AS live_experiments,
       (SELECT COUNT(*)::text FROM live_experiment
        WHERE status = 'closed') AS closed_experiments`,
  );
  const row = rows[0];
  const coverage =
    Number(row.symbols) >= 50 &&
    Number(row.daily_rows) >= 50_000 &&
    Number(row.backtests) >= 150 &&
    Number(row.experiments) >= 10_000 &&
    Number(row.candidates) > 0 &&
    Number(row.basis_symbols) >= 14;
  const basisFresh =
    row.basis_age_seconds !== null && row.basis_age_seconds < 1_200;
  const experimentsFresh =
    row.experiment_age_seconds !== null &&
    row.experiment_age_seconds < 4 * 24 * 60 * 60;
  return {
    id: "trading-system-research",
    group: "trading-system",
    name: "Underlying + research data",
    status:
      !coverage || !experimentsFresh
        ? "fail"
        : !basisFresh
          ? "warn"
          : "ok",
    detail: `${row.symbols} symbols · ${row.experiments} tests · ${row.candidates} candidates · live experience ${row.closed_experiments}/${row.live_experiments} closed · lab ${Math.floor((row.experiment_age_seconds ?? 0) / 60)}m`,
  };
};
