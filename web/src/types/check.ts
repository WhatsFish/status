export type Severity = "ok" | "warn" | "fail";

export type CheckResult = {
  /** stable id, for diffing across refreshes */
  id: string;
  /** group label rendered as a section header (e.g. "ai-feed", "vpn", "host") */
  group: string;
  /** human-readable name */
  name: string;
  status: Severity;
  /** one-line context: "12 days until expiry", "4h since last digest", "503 from /chat" */
  detail: string;
  /** how long the check took (ms) */
  durationMs: number;
};

export type CheckSummary = {
  ok: number;
  warn: number;
  fail: number;
  total: number;
  /** worst severity in the set; drives the overall HTTP status code */
  worst: Severity;
  generatedAt: string;
};

export type CheckBundle = {
  summary: CheckSummary;
  results: CheckResult[];
};
