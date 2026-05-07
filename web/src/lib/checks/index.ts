import type { CheckFn } from "../runner";
import { runOne, summarize } from "../runner";
import type { CheckBundle } from "@/types/check";

import { diskUsage, memory, swap, loadavg, uptime } from "./host";
import { tlsExpiry } from "./tls";
import { digestFreshness, digestCompleteness, cronPulse } from "./ai-feed";
import { hysteriaPipeline, activeConnections } from "./vpn";
import {
  aiFeedHttp,
  aiPlaygroundHttp,
  vpnMonitorHttp,
  umamiHttp,
  umamiScript,
  myblogHttp,
  indexHttp,
} from "./http";
import { recentPageviews } from "./umami";
import { goaccessReportFreshness } from "./goaccess";
import { pgPing } from "./postgres";

const CHECKS: CheckFn[] = [
  // host
  diskUsage,
  memory,
  swap,
  loadavg,
  uptime,
  pgPing,
  indexHttp,
  // tls
  tlsExpiry,
  // ai-feed
  aiFeedHttp,
  digestFreshness,
  digestCompleteness,
  cronPulse,
  // vpn
  hysteriaPipeline,
  activeConnections,
  vpnMonitorHttp,
  // ai-playground
  aiPlaygroundHttp,
  // umami
  umamiHttp,
  umamiScript,
  recentPageviews,
  // traffic
  goaccessReportFreshness,
  // myblog
  myblogHttp,
];

export async function runAllChecks(): Promise<CheckBundle> {
  const results = await Promise.all(CHECKS.map((c) => runOne(c)));
  return summarize(results);
}
