import { query } from "../pg";
import type { CheckFn } from "../runner";

export const pgPing: CheckFn = async () => {
  await query("vpn", "SELECT 1");
  return {
    id: "pg",
    group: "host",
    name: "Postgres",
    status: "ok",
    detail: "SELECT 1 round-trip ok",
  };
};
