import { Client, type QueryResultRow } from "pg";

type DbName = "vpn" | "umami" | "cost" | "youtube-clips" | "quit-diary" | "cloudpet" | "reno";

function configFor(db: DbName) {
  const host = process.env.PG_HOST ?? "db";
  const port = parseInt(process.env.PG_PORT ?? "5432", 10);
  if (db === "vpn") {
    return {
      host,
      port,
      user: process.env.VPN_PG_USER ?? "vpn_mon",
      password: process.env.VPN_PG_PASSWORD ?? "",
      database: process.env.VPN_PG_DB ?? "vpn_monitor",
    };
  }
  if (db === "cost") {
    return {
      host,
      port,
      user: process.env.COST_PG_USER ?? "cost_tracker",
      password: process.env.COST_PG_PASSWORD ?? "",
      database: process.env.COST_PG_DB ?? "cost_tracker",
    };
  }
  if (db === "youtube-clips") {
    return {
      host,
      port,
      user: process.env.YOUTUBE_CLIPS_PG_USER ?? "youtube_clips",
      password: process.env.YOUTUBE_CLIPS_PG_PASSWORD ?? "",
      database: process.env.YOUTUBE_CLIPS_PG_DB ?? "youtube_clips",
    };
  }
  if (db === "quit-diary") {
    return {
      host,
      port,
      user: process.env.QUIT_DIARY_PG_USER ?? "quit_diary",
      password: process.env.QUIT_DIARY_PG_PASSWORD ?? "",
      database: process.env.QUIT_DIARY_PG_DB ?? "quit_diary",
    };
  }
  if (db === "cloudpet") {
    return {
      host,
      port,
      user: process.env.CLOUDPET_PG_USER ?? "cloudpet",
      password: process.env.CLOUDPET_PG_PASSWORD ?? "",
      database: process.env.CLOUDPET_PG_DB ?? "cloudpet",
    };
  }
  if (db === "reno") {
    return {
      host,
      port,
      user: process.env.RENO_PG_USER ?? "reno_cost",
      password: process.env.RENO_PG_PASSWORD ?? "",
      database: process.env.RENO_PG_DB ?? "reno_cost",
    };
  }
  return {
    host,
    port,
    user: process.env.UMAMI_PG_USER ?? "umami",
    password: process.env.UMAMI_PG_PASSWORD ?? "",
    database: process.env.UMAMI_PG_DB ?? "umami",
  };
}

/**
 * Ad-hoc query helper. Opens a fresh connection, queries, closes — fine at the
 * volume the status page generates (a handful of queries per refresh).
 */
export async function query<T extends QueryResultRow = Record<string, unknown>>(
  db: DbName,
  sql: string,
): Promise<T[]> {
  const client = new Client(configFor(db));
  await client.connect();
  try {
    const r = await client.query<T>(sql);
    return r.rows;
  } finally {
    await client.end();
  }
}
