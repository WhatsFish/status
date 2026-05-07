import { query } from "../pg";
import type { CheckFn } from "../runner";

/**
 * Umami pageview events in the last hour. The events fall into the "website_event"
 * table (Umami v2 schema). 0 over 1h on a publicly-reachable site is suspicious;
 * could mean script blocked, ad-blocker on the only visitor, or no traffic at all.
 */
export const recentPageviews: CheckFn = async () => {
  // Umami's table name varies slightly between releases. v2 uses lowercase
  // website_event; quote the identifier so case is preserved.
  const rows = await query<{ count: string }>(
    "umami",
    `SELECT COUNT(*)::text AS count FROM website_event WHERE created_at > NOW() - INTERVAL '1 hour'`,
  );
  const count = parseInt(rows[0]?.count ?? "0", 10);
  return {
    id: "umami-recent",
    group: "umami",
    name: "Pageview events (last 1h)",
    // Pure observation; never failing on this — too noisy.
    status: "ok",
    detail: `${count} event${count === 1 ? "" : "s"}`,
  };
};
