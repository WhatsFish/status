import { Client, type QueryResultRow } from "pg";

type DbName = "vpn" | "umami";

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
