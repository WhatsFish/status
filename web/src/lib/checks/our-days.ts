import { query } from "../pg";
import type { CheckFn } from "../runner";

export const ourDaysHealth: CheckFn = async () => {
  const [row] = await query<{
    schema_version: number;
    last_tick: Date | null;
    worker_error: string | null;
    paused: boolean;
    stuck_imports: number;
    missed_editions: number;
    next_week_count: number;
    delivery_attention: number;
    queue_loop: boolean;
  }>("our-days", "SELECT * FROM service_health");
  const stale = !row?.last_tick || Date.now() - row.last_tick.getTime() > 5 * 60_000;
  const failed = !row || row.schema_version !== 1 || stale || !!row.worker_error ||
    row.stuck_imports > 0 || row.missed_editions > 0;
  const warn = !!row && (row.delivery_attention > 0 ||
    (!row.paused && (row.next_week_count === 0 || (!row.queue_loop && row.next_week_count < 3))));
  return {
    id: "our-days-storage",
    group: "our-days",
    name: "Private storage / delivery health",
    status: failed ? "fail" : warn ? "warn" : "ok",
    detail: !row ? "Health view returned no rows" :
      `${row.paused ? "Publication paused" : "Publication enabled"}; ` +
      `worker ${stale ? "stale" : "current"}${row.worker_error ? ` (${row.worker_error})` : ""}; ` +
      `stuck imports ${row.stuck_imports}; missed editions ${row.missed_editions}; ` +
      `delivery attention ${row.delivery_attention}; eligible queued photos ${row.next_week_count}; ` +
      `cycling ${row.queue_loop ? "enabled" : "disabled"}`,
  };
};
