import type { CheckFn } from "../runner";
import { runOne, summarize } from "../runner";
import type { CheckBundle } from "@/types/check";

import { diskUsage, dataDiskUsage, memory, swap, loadavg, uptime } from "./host";
import { tlsExpiry } from "./tls";
import {
  digestFreshness,
  digestCompleteness,
  sourceFetchHealth,
  digestSchema,
  translationParity,
} from "./ai-feed";
import { cronChecks } from "./cron";
import { hysteriaPipeline, activeConnections } from "./vpn";
import {
  aiFeedHttp,
  aiFeedRsshubHttp,
  aiPlaygroundHttp,
  vpnMonitorHttp,
  umamiHttp,
  umamiScript,
  myblogHttp,
  indexHttp,
  costHttp,
  stockHttp,
} from "./http";
import { agentCostLoggingParity, recentSpend } from "./cost";
import {
  stockPriceFreshness,
  stockPredictionFreshness,
  stockAgentLoggingParity,
} from "./stock";
import { recentPageviews } from "./umami";
import { goaccessReportFreshness } from "./goaccess";
import { pgPing } from "./postgres";

const CHECKS: CheckFn[] = [
  // host
  diskUsage,
  dataDiskUsage,
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
  aiFeedRsshubHttp,
  digestFreshness,
  digestCompleteness,
  sourceFetchHealth,
  digestSchema,
  translationParity,
  // cron heartbeats — per-job freshness from $HEARTBEAT_DIR/<job>
  ...cronChecks,
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
  // cost
  costHttp,
  recentSpend,
  agentCostLoggingParity,
  // stock
  stockHttp,
  stockPriceFreshness,
  stockPredictionFreshness,
  stockAgentLoggingParity,
];

export async function runAllChecks(): Promise<CheckBundle> {
  const results = await Promise.all(CHECKS.map((c) => runOne(c)));
  return summarize(results);
}
