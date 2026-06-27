import { query } from "../pg";
import type { CheckFn } from "../runner";

/**
 * reno-cost (装修花费) is a single-admin expense ledger with no scheduled
 * ingest — the admin enters rows by hand. The meaningful signal is simply that
 * the schema is reachable as the reno_cost role; row count is liveness only
 * (an empty ledger early on is fine, not a failure).
 */
export const renoSchema: CheckFn = async () => {
  const rows = await query<{ count: string }>(
    "reno",
    `SELECT COUNT(*)::text AS count
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'expense'`,
  );
  const present = parseInt(rows[0]?.count ?? "0", 10) === 1;
  return {
    id: "reno-schema",
    group: "reno",
    name: "Schema",
    status: present ? "ok" : "fail",
    detail: present ? "expense table present" : "expense table missing",
  };
};

export const renoRows: CheckFn = async () => {
  const rows = await query<{ n: string }>(
    "reno",
    `SELECT COUNT(*)::text AS n FROM expense`,
  );
  const n = parseInt(rows[0]?.n ?? "0", 10);
  return {
    id: "reno-rows",
    group: "reno",
    name: "Expenses recorded",
    status: "ok", // liveness only — an empty ledger is valid
    detail: `${n} expense${n === 1 ? "" : "s"} logged`,
  };
};
