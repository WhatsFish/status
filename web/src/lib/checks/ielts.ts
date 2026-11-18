import { query } from "../pg";
import type { CheckFn } from "../runner";

export const ieltsStorage: CheckFn = async () => {
  const [row] = await query<{
    schema_version: number;
    question_count: number;
    answer_count: number;
    last_answer_at: Date | null;
  }>("ielts", "SELECT * FROM service_health");
  return {
    id: "ielts-storage",
    group: "ielts",
    name: "Catalog / answer storage",
    status: row?.schema_version === 1 ? "ok" : "fail",
    detail: !row ? "Health view returned no rows" :
      `${row.question_count} questions; ${row.answer_count} answers; ` +
      `last save ${row.last_answer_at?.toISOString() ?? "none yet (manual input only)"}`,
  };
};
