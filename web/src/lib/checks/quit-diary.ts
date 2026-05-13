import { query } from "../pg";
import type { CheckFn } from "../runner";

/**
 * V1 has no scheduled ingest — it's a mini program backend. The meaningful
 * signal is "the schema is reachable as the quit_diary role and contains
 * the tables we expect." Add freshness checks (entries-per-day, DAU) once
 * there's enough usage that a flatline would be a real signal.
 */
export const quitDiarySchema: CheckFn = async () => {
  const rows = await query<{ count: string }>(
    "quit-diary",
    `SELECT COUNT(*)::text AS count
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('app_user', 'diary_entry')`,
  );
  const present = parseInt(rows[0]?.count ?? "0", 10) === 2;
  return {
    id: "quit-diary-schema",
    group: "quit-diary",
    name: "Schema",
    status: present ? "ok" : "fail",
    detail: present ? "app_user + diary_entry present" : "tables missing",
  };
};
