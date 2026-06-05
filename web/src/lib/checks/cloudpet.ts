import { query } from "../pg";
import type { CheckFn } from "../runner";

/**
 * cloudpet (本命小宠) is a mini program backend with no scheduled ingest — the
 * game is authoritative on compute-on-read. The meaningful signals are: the
 * schema is reachable as the cloudpet role, and (liveness, not correctness) pets
 * are being ticked when people play.
 */
export const cloudpetSchema: CheckFn = async () => {
  const rows = await query<{ count: string }>(
    "cloudpet",
    `SELECT COUNT(*)::text AS count
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('app_user','pet','pet_state','action_log')`,
  );
  const present = parseInt(rows[0]?.count ?? "0", 10) === 4;
  return {
    id: "cloudpet-schema",
    group: "cloudpet",
    name: "Schema",
    status: present ? "ok" : "fail",
    detail: present ? "app_user + pet + pet_state + action_log present" : "tables missing",
  };
};

// Liveness only — compute-on-read is the source of truth, so a quiet day (no
// recent tick) is fine, not a failure.
export const cloudpetTick: CheckFn = async () => {
  const rows = await query<{ mins: string | null }>(
    "cloudpet",
    `SELECT (extract(epoch FROM (now() - max(last_tick))) / 60)::text AS mins FROM pet_state`,
  );
  const mins = rows[0]?.mins == null ? null : parseFloat(rows[0].mins);
  const status = mins == null ? "ok" : mins >= 60 * 24 ? "warn" : "ok"; // weekend/quiet tolerant
  return {
    id: "cloudpet-tick",
    group: "cloudpet",
    name: "Pets ticked",
    status,
    detail: mins == null ? "no pets yet" : `last tick ${Math.round(mins)}m ago`,
  };
};
