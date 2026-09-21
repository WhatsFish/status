import { query } from "../pg";
import type { CheckFn } from "../runner";

export const liftLogStorage: CheckFn = async () => {
  const [row] = await query<{ initialized: boolean; last_write_at: Date | null }>(
    "lift-log", "SELECT initialized, last_write_at FROM service_health",
  );
  return {
    id: "lift-log-storage",
    group: "lift-log",
    name: "Training storage",
    status: row ? "ok" : "fail",
    detail: !row ? "Health view returned no rows" : row.initialized && row.last_write_at
      ? `Last write ${row.last_write_at.toISOString()}; user-driven, no freshness deadline`
      : "Schema ready; awaiting first check-in",
  };
};
