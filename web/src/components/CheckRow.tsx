import type { CheckResult } from "@/types/check";

const DOT_CLASS: Record<CheckResult["status"], string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-red-500",
};

export function CheckRow({ check }: { check: CheckResult }) {
  return (
    <div className="flex items-baseline gap-3 py-2.5 border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
      <span
        aria-label={check.status}
        className={`inline-block w-2 h-2 rounded-full mt-1.5 shrink-0 ${DOT_CLASS[check.status]}`}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-medium text-sm">{check.name}</div>
          <div className="text-[11px] font-mono text-neutral-500 dark:text-neutral-500 shrink-0">
            {check.durationMs}ms
          </div>
        </div>
        <div className="text-sm text-neutral-600 dark:text-neutral-400 leading-snug mt-0.5">
          {check.detail}
        </div>
      </div>
    </div>
  );
}
