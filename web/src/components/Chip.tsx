import type { CheckResult } from "@/types/check";

const DOT_CLASS: Record<CheckResult["status"] | "unknown", string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
  unknown: "bg-neutral-400",
};

export function Chip({
  status,
  label,
  value,
}: {
  status: CheckResult["status"] | "unknown";
  label: string;
  value: string;
}) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-xs whitespace-nowrap">
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${DOT_CLASS[status]}`} />
      <span className="text-neutral-500 dark:text-neutral-500">{label}</span>
      <span className="font-mono text-neutral-800 dark:text-neutral-200">{value}</span>
    </div>
  );
}
