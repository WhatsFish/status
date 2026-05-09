import { query } from "../pg";
import type { CheckFn } from "../runner";

/**
 * Phase 1 has only the `profiles` table and no scheduled data ingest, so the
 * meaningful signal is "the schema is reachable as the youtube_clips role
 * and contains the table we expect". Phase 2 will add freshness checks
 * (topic/source/job/output ages) once the pipeline is producing rows.
 */
export const youtubeClipsSchema: CheckFn = async () => {
  const rows = await query<{ count: string }>(
    "youtube-clips",
    "SELECT COUNT(*)::text AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles'",
  );
  const present = parseInt(rows[0]?.count ?? "0", 10) === 1;
  return {
    id: "youtube-clips-schema",
    group: "youtube-clips",
    name: "Schema",
    status: present ? "ok" : "fail",
    detail: present ? "profiles table present" : "profiles table missing",
  };
};
