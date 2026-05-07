import Link from "next/link";
import { runAllChecks } from "@/lib/checks";
import { CheckRow } from "@/components/CheckRow";

export const dynamic = "force-dynamic";
// Auto-refresh every 60s without client-side JS, by setting revalidate.
export const revalidate = 60;

const GROUP_ORDER = [
  "host",
  "tls",
  "ai-feed",
  "vpn",
  "ai-playground",
  "umami",
  "traffic",
  "myblog",
];

const GROUP_LABEL: Record<string, string> = {
  host: "Host",
  tls: "TLS",
  "ai-feed": "ai-feed",
  vpn: "VPN (Hysteria + monitor)",
  "ai-playground": "ai-playground",
  umami: "Umami",
  traffic: "Traffic report",
  myblog: "Blog",
};

export default async function StatusPage() {
  const bundle = await runAllChecks();
  const { summary, results } = bundle;

  const grouped = new Map<string, typeof results>();
  for (const r of results) {
    if (!grouped.has(r.group)) grouped.set(r.group, []);
    grouped.get(r.group)!.push(r);
  }

  const orderedGroups = [
    ...GROUP_ORDER.filter((g) => grouped.has(g)),
    ...[...grouped.keys()].filter((g) => !GROUP_ORDER.includes(g)),
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
      <header className="mb-10">
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

      {/*
        CSS multi-column layout: 1 column on mobile, 2 on md (≥768px), 3 on
        xl (≥1280px). `break-inside-avoid` keeps a service group whole — it
        won't split across two columns. The browser auto-balances column
        heights, so groups of unequal size pack reasonably without manual
        ordering.
      */}
      <div className="gap-6 columns-1 md:columns-2 xl:columns-3">
        {orderedGroups.map((g) => (
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
