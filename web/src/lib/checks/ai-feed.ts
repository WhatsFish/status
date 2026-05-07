import { promises as fs } from "fs";
import path from "path";
import type { CheckFn } from "../runner";

const DIGEST_DIR = process.env.DIGEST_DIR ?? "/data/ai-feed/digest";
const FETCH_LOG = process.env.AI_FEED_FETCH_LOG ?? "/data/ai-feed/fetch.log";

function fmtAgoHours(ms: number): string {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60_000)}m ago`;
  if (h < 48) return `${h.toFixed(1)}h ago`;
  return `${(h / 24).toFixed(1)}d ago`;
}

/**
 * Latest digest file age. Cron is 12h cadence (00:13 / 12:13 UTC); allow ~2h
 * grace before WARN, full slot miss before FAIL.
 */
export const digestFreshness: CheckFn = async () => {
  let entries: string[];
  try {
    entries = await fs.readdir(DIGEST_DIR);
  } catch {
    return {
      id: "ai-feed-digest",
      group: "ai-feed",
      name: "Latest digest",
      status: "fail",
      detail: `cannot read ${DIGEST_DIR}`,
    };
  }
  const jsons = entries.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  if (jsons.length === 0) {
    return {
      id: "ai-feed-digest",
      group: "ai-feed",
      name: "Latest digest",
      status: "fail",
      detail: "no digest files found",
    };
  }
  const latest = jsons.at(-1)!;
  const stat = await fs.stat(path.join(DIGEST_DIR, latest));
  const ageMs = Date.now() - stat.mtimeMs;
  const ageHours = ageMs / 3_600_000;
  return {
    id: "ai-feed-digest",
    group: "ai-feed",
    name: "Latest digest",
    status: ageHours > 30 ? "fail" : ageHours > 14 ? "warn" : "ok",
    detail: `${latest} updated ${fmtAgoHours(ageMs)}`,
  };
};

/**
 * Did the agent produce all three artifacts (md, json, zh.json) for today?
 * Useful catch for "budget cap killed the run mid-write" failures.
 */
export const digestCompleteness: CheckFn = async () => {
  const today = new Date().toISOString().slice(0, 10);
  const required = [`${today}.md`, `${today}.json`, `${today}.zh.json`];
  const results = await Promise.all(
    required.map(async (f) => {
      try {
        await fs.access(path.join(DIGEST_DIR, f));
        return { f, present: true };
      } catch {
        return { f, present: false };
      }
    }),
  );
  const missing = results.filter((r) => !r.present).map((r) => r.f);
  // Before the morning slot fires there's nothing for today — that's not a failure.
  const nowUtcHour = new Date().getUTCHours();
  const expectMorning = nowUtcHour >= 1; // 00:13 UTC cron, give it a few minutes grace
  if (missing.length === required.length && !expectMorning) {
    return {
      id: "ai-feed-today",
      group: "ai-feed",
      name: "Today's artifacts",
      status: "ok",
      detail: "morning slot hasn't fired yet",
    };
  }
  if (missing.length === 0) {
    return {
      id: "ai-feed-today",
      group: "ai-feed",
      name: "Today's artifacts",
      status: "ok",
      detail: `${today} md + json + zh.json all present`,
    };
  }
  return {
    id: "ai-feed-today",
    group: "ai-feed",
    name: "Today's artifacts",
    status: missing.length === required.length ? "fail" : "warn",
    detail: `missing: ${missing.join(", ")}`,
  };
};

/**
 * Source-fetch failures from the most recent fetch.py run. fetch.log entries
 * for one run sit between a "run start" line and a "run end" line. Walk back
 * from the file tail, find the latest pair, count how many sources logged FAIL.
 */
export const sourceFetchHealth: CheckFn = async () => {
  let txt: string;
  try {
    txt = await fs.readFile(FETCH_LOG, "utf-8");
  } catch {
    return {
      id: "ai-feed-fetch",
      group: "ai-feed",
      name: "Source fetch (last run)",
      status: "warn",
      detail: `cannot read ${FETCH_LOG}`,
    };
  }
  const lines = txt.split("\n");
  // Find the most recent 'run end' index; then the matching 'run start' before it.
  let endIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].includes("run end:")) {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return {
      id: "ai-feed-fetch",
      group: "ai-feed",
      name: "Source fetch (last run)",
      status: "warn",
      detail: "no completed run in fetch.log",
    };
  }
  let startIdx = endIdx;
  for (let i = endIdx - 1; i >= 0; i--) {
    if (lines[i].includes("run start:")) {
      startIdx = i;
      break;
    }
  }
  const block = lines.slice(startIdx, endIdx + 1);
  const startMatch = block[0].match(/run start: (\d+) sources/);
  const totalSources = startMatch ? parseInt(startMatch[1], 10) : 0;
  const failCount = block.filter((l) => /\bFAIL\b/.test(l)).length;
  // The "new items" total is informational, not a fail trigger.
  const endMatch = block.at(-1)!.match(/run end: (\d+) new items/);
  const newItems = endMatch ? parseInt(endMatch[1], 10) : null;
  return {
    id: "ai-feed-fetch",
    group: "ai-feed",
    name: "Source fetch (last run)",
    status: failCount >= 6 ? "fail" : failCount >= 3 ? "warn" : "ok",
    detail:
      `${failCount}/${totalSources} sources failed` +
      (newItems !== null ? ` · ${newItems} new items` : ""),
  };
};

type Digest = {
  date: string;
  runs: Array<{
    headline: string;
    developments: Array<{ id: string; title: string; take: string; tags: string[] }>;
    themes: Array<{ title: string; body: string }>;
    worth_reading: Array<{ label: string; url: string }>;
  }>;
};

async function loadLatestDigest(suffix: ".json" | ".zh.json"): Promise<{ name: string; data: Digest } | null> {
  const entries = await fs.readdir(DIGEST_DIR);
  const re = suffix === ".json" ? /^\d{4}-\d{2}-\d{2}\.json$/ : /^\d{4}-\d{2}-\d{2}\.zh\.json$/;
  const sorted = entries.filter((f) => re.test(f)).sort();
  const name = sorted.at(-1);
  if (!name) return null;
  const data = JSON.parse(await fs.readFile(path.join(DIGEST_DIR, name), "utf-8")) as Digest;
  return { name, data };
}

/**
 * Schema sanity on the latest digest: did the agent produce a structurally
 * reasonable document? Catches the slot-merge bug class (runs[] piling up),
 * empty / one-development digests (agent gave up), and missing tags/links
 * per development.
 */
export const digestSchema: CheckFn = async () => {
  const loaded = await loadLatestDigest(".json");
  if (!loaded) {
    return {
      id: "ai-feed-schema",
      group: "ai-feed",
      name: "Digest schema",
      status: "fail",
      detail: "no digest .json found",
    };
  }
  const issues: string[] = [];
  const { name, data } = loaded;
  if (!Array.isArray(data.runs) || data.runs.length === 0) {
    issues.push("runs[] empty");
  } else if (data.runs.length > 2) {
    issues.push(`runs[] has ${data.runs.length} entries (slot-merge expects ≤ 2)`);
  }
  for (let i = 0; i < (data.runs ?? []).length; i++) {
    const r = data.runs[i];
    if (!r.headline || r.headline.trim().length < 20) {
      issues.push(`run[${i}] headline too short`);
    }
    if (!Array.isArray(r.developments) || r.developments.length < 2) {
      issues.push(`run[${i}] only ${r.developments?.length ?? 0} developments`);
    } else if (r.developments.length > 8) {
      issues.push(`run[${i}] has ${r.developments.length} developments (unusually many)`);
    }
    for (const d of r.developments ?? []) {
      if (!d.id || !d.title || !d.take) issues.push(`run[${i}] dev missing required field`);
      if (!Array.isArray(d.tags) || d.tags.length === 0) issues.push(`dev ${d.id} has no tags`);
    }
  }
  if (issues.length === 0) {
    const totalDevs = data.runs.reduce((acc, r) => acc + r.developments.length, 0);
    return {
      id: "ai-feed-schema",
      group: "ai-feed",
      name: "Digest schema",
      status: "ok",
      detail: `${name}: ${data.runs.length} run(s), ${totalDevs} developments`,
    };
  }
  return {
    id: "ai-feed-schema",
    group: "ai-feed",
    name: "Digest schema",
    status: issues.length > 2 ? "fail" : "warn",
    detail: `${name}: ${issues.slice(0, 3).join("; ")}${issues.length > 3 ? `; +${issues.length - 3} more` : ""}`,
  };
};

/**
 * The Chinese version must mirror the English one structurally — same number
 * of runs, same dev IDs, all translatable fields non-empty. Catches the case
 * where the agent half-translated and exited.
 */
export const translationParity: CheckFn = async () => {
  const en = await loadLatestDigest(".json");
  const zh = await loadLatestDigest(".zh.json");
  if (!en) {
    return {
      id: "ai-feed-translation",
      group: "ai-feed",
      name: "Translation parity",
      status: "warn",
      detail: "no English digest yet",
    };
  }
  if (!zh) {
    return {
      id: "ai-feed-translation",
      group: "ai-feed",
      name: "Translation parity",
      status: "fail",
      detail: `no .zh.json for latest day (${en.name})`,
    };
  }
  // The two should be on the same date.
  const enDate = en.name.replace(/\.json$/, "");
  const zhDate = zh.name.replace(/\.zh\.json$/, "");
  if (enDate !== zhDate) {
    return {
      id: "ai-feed-translation",
      group: "ai-feed",
      name: "Translation parity",
      status: "warn",
      detail: `latest en ${enDate} but latest zh ${zhDate}`,
    };
  }
  const issues: string[] = [];
  if (en.data.runs.length !== zh.data.runs.length) {
    issues.push(`runs[] mismatch en=${en.data.runs.length} vs zh=${zh.data.runs.length}`);
  }
  const minRuns = Math.min(en.data.runs.length, zh.data.runs.length);
  for (let i = 0; i < minRuns; i++) {
    if (en.data.runs[i].developments.length !== zh.data.runs[i].developments.length) {
      issues.push(`run[${i}] dev count mismatch`);
    }
    if (!zh.data.runs[i].headline?.trim()) {
      issues.push(`run[${i}] zh headline empty`);
    }
    const enIds = new Set(en.data.runs[i].developments.map((d) => d.id));
    const zhIds = new Set(zh.data.runs[i].developments.map((d) => d.id));
    for (const id of enIds) {
      if (!zhIds.has(id)) issues.push(`dev id ${id} missing in zh`);
    }
  }
  if (issues.length === 0) {
    return {
      id: "ai-feed-translation",
      group: "ai-feed",
      name: "Translation parity",
      status: "ok",
      detail: `${enDate} en + zh structurally aligned`,
    };
  }
  return {
    id: "ai-feed-translation",
    group: "ai-feed",
    name: "Translation parity",
    status: issues.length > 2 ? "fail" : "warn",
    detail: `${issues.slice(0, 2).join("; ")}${issues.length > 2 ? `; +${issues.length - 2} more` : ""}`,
  };
};
