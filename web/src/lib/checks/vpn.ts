import { query } from "../pg";
import type { CheckFn } from "../runner";

function fmtAgo(ms: number): string {
  if (ms < 1000) return `${ms}ms ago`;
  const s = Math.floor(ms / 1000);
  if (s < 90) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${(m / 60).toFixed(1)}h ago`;
}

/**
 * The Hysteria VPN server itself has no web UI. We use its observability proxy
 * — the vpn-monitor collector polls Hysteria's stats API every 30s and writes
 * traffic_snapshot rows. Fresh rows = both Hysteria server AND collector are
 * alive. Stale rows = something in that pipeline is down (cannot disambiguate
 * from here).
 */
export const hysteriaPipeline: CheckFn = async () => {
  const rows = await query<{ ts: Date }>(
    "vpn",
    "SELECT ts FROM traffic_snapshot ORDER BY ts DESC LIMIT 1",
  );
  if (rows.length === 0) {
    return {
      id: "vpn-pipeline",
      group: "vpn",
      name: "Hysteria pipeline (server + collector)",
      status: "fail",
      detail: "no traffic_snapshot rows ever written",
    };
  }
  const ageMs = Date.now() - new Date(rows[0].ts).getTime();
  return {
    id: "vpn-pipeline",
    group: "vpn",
    name: "Hysteria pipeline (server + collector)",
    // Collector polls every 30s; warn after 90s, fail after 5min.
    status: ageMs > 300_000 ? "fail" : ageMs > 90_000 ? "warn" : "ok",
    detail: `last poll ${fmtAgo(ageMs)} — Hysteria + collector both responding`,
  };
};

/**
 * Active connection count from the latest online_snapshot. Informational —
 * 0 active is normal when no clients are connected, not a failure.
 */
export const activeConnections: CheckFn = async () => {
  const rows = await query<{ ts: Date; total: number }>(
    "vpn",
    "SELECT ts, COALESCE(SUM(connections), 0)::int AS total " +
      "FROM online_snapshot " +
      "WHERE ts > NOW() - INTERVAL '90 seconds' " +
      "GROUP BY ts ORDER BY ts DESC LIMIT 1",
  );
  if (rows.length === 0) {
    return {
      id: "vpn-active",
      group: "vpn",
      name: "Active connections (last 90s)",
      status: "warn",
      detail: "no recent online_snapshot",
    };
  }
  const total = Number(rows[0].total);
  return {
    id: "vpn-active",
    group: "vpn",
    name: "Active connections (last 90s)",
    status: "ok",
    detail: `${total} client${total === 1 ? "" : "s"} connected`,
  };
};
