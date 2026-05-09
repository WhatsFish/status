import Link from "next/link";
import { runAllChecks } from "@/lib/checks";
import { CheckRow } from "@/components/CheckRow";
import { Chip } from "@/components/Chip";
import type { CheckResult } from "@/types/check";

export const dynamic = "force-dynamic";
// Auto-refresh every 60s without client-side JS, by setting revalidate.
export const revalidate = 60;

const HERO_GROUPS = ["agents", "ai-feed"];

const REST_ORDER = [
  "host",
  "tls",
  "cron",
  "vpn",
  "ai-playground",
  "umami",
  "traffic",
  "myblog",
  "cost",
  "stock",
  "youtube-clips",
];

const GROUP_LABEL: Record<string, string> = {
  host: "Host",
  tls: "TLS",
  cron: "Cron jobs",
  agents: "Agents",
  "ai-feed": "ai-feed",
  vpn: "VPN (Hysteria + monitor)",
  "ai-playground": "ai-playground",
  umami: "Umami",
  traffic: "Traffic report",
  myblog: "Blog",
  cost: "Cost tracker",
  stock: "Stock analyst",
  "youtube-clips": "youtube-clips",
};

// Pulled out of their original groups into a virtual "agents" group, so all
// agent-related signals (run freshness + cost-logging parity) sit together.
const AGENT_IDS = new Set([
  "cron-ai-feed-agent",
  "cron-stock-agent",
  "cost-logging-parity",
  "stock-agent-parity",
]);

// Top chip strip: a compact value extracted from a known check's `detail` string.
type ChipSpec = { id: string; label: string; extract: (detail: string) => string };
const pctChip = (d: string): string => {
  const m = d.match(/^([\d.]+)%/);
  return m ? `${Math.round(parseFloat(m[1]))}%` : "?";
};
const lastSuccessChip = (d: string): string =>
  d.match(/last success ([\d.]+[a-z]+)/)?.[1] ?? "?";
const CHIPS: ChipSpec[] = [
  { id: "host-disk", label: "/", extract: pctChip },
  { id: "host-disk-data", label: "/data", extract: pctChip },
  { id: "host-mem", label: "Mem", extract: pctChip },
  { id: "host-load", label: "Load", extract: (d) => d.match(/^[\d.]+/)?.[0] ?? "?" },
  { id: "cron-ai-feed-agent", label: "ai-feed", extract: lastSuccessChip },
  { id: "cron-stock-agent", label: "stock", extract: lastSuccessChip },
  { id: "cost-30d", label: "30d", extract: (d) => d.match(/\$[\d.]+/)?.[0] ?? "?" },
];

export default async function StatusPage() {
  const bundle = await runAllChecks();
  const { summary, results } = bundle;

  const byId = new Map<string, CheckResult>(results.map((r) => [r.id, r]));

  const grouped = new Map<string, CheckResult[]>();
  for (const r of results) {
    const group = AGENT_IDS.has(r.id) ? "agents" : r.group;
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(r);
  }

  const heroGroups = HERO_GROUPS.filter((g) => grouped.has(g));
  const restGroups = [
    ...REST_ORDER.filter((g) => grouped.has(g)),
    ...[...grouped.keys()].filter(
      (g) => !REST_ORDER.includes(g) && !HERO_GROUPS.includes(g),
    ),
  ];

  const overallTone =
    summary.worst === "fail"
      ? { dot: "bg-red-500", text: "text-red-600 dark:text-red-400", label: "Outage" }
      : summary.worst === "warn"
        ? { dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400", label: "Degraded" }
        : { dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400", label: "All systems normal" };

  const generated = new Date(summary.generatedAt);

  return (
    <main className="max-w-6xl mx-auto px-5 py-12">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight mb-3">status</h1>
        <div className="flex items-center gap-2.5 mb-1">
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${overallTone.dot}`} />
          <span className={`text-sm font-medium ${overallTone.text}`}>{overallTone.label}</span>
          <span className="text-sm text-neutral-500 dark:text-neutral-500">
            · {summary.ok} ok · {summary.warn} warn · {summary.fail} fail
          </span>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-500 font-mono">
          generated {generated.toLocaleString()} · refreshes every 60s ·{" "}
          <Link href="/api/checks" className="underline">
            json
          </Link>
        </p>
      </header>

      {/* At-a-glance chip strip — system + agents */}
      <div className="flex flex-wrap gap-2 mb-8">
        {CHIPS.map(({ id, label, extract }) => {
          const c = byId.get(id);
          return (
            <Chip
              key={id}
              status={c?.status ?? "unknown"}
              label={label}
              value={c ? extract(c.detail ?? "") : "—"}
            />
          );
        })}
      </div>

      {/* Hero: ai-feed + Agents — featured cards, more visual weight */}
      {heroGroups.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {heroGroups.map((g) => (
            <section key={g}>
              <h2 className="text-sm font-semibold tracking-tight mb-2">
                {GROUP_LABEL[g] ?? g}
              </h2>
              <div className="border border-neutral-200 dark:border-neutral-800 rounded-md px-4 bg-white dark:bg-neutral-900">
                {grouped.get(g)!.map((c) => (
                  <CheckRow key={c.id} check={c} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/*
        CSS multi-column layout for the rest: 1 column on mobile, 2 on md
        (≥768px), 3 on xl (≥1280px). `break-inside-avoid` keeps a service
        group whole.
      */}
      <div className="gap-6 columns-1 md:columns-2 xl:columns-3">
        {restGroups.map((g) => (
          <section key={g} className="break-inside-avoid mb-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-500 mb-2">
              {GROUP_LABEL[g] ?? g}
            </h2>
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-md px-4 bg-white dark:bg-neutral-900">
              {grouped.get(g)!.map((c) => (
                <CheckRow key={c.id} check={c} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <footer className="mt-12 text-xs text-neutral-500 dark:text-neutral-500 leading-relaxed">
        Feature-level health for services on this VM. External liveness (the
        VM itself) is monitored separately by UptimeRobot — if you can read
        this page, the host is up; the colored dots above show whether each
        service is doing what it&apos;s supposed to be doing.
      </footer>
    </main>
  );
}
