import type { CheckFn } from "../runner";
import { runOne, summarize } from "../runner";
import type { CheckBundle } from "@/types/check";

import { diskUsage, dataDiskUsage, videoDiskUsage, memory, swap, loadavg, uptime } from "./host";
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
  vpnMonitorHttp,
  umamiHttp,
  umamiScript,
  myblogHttp,
  indexHttp,
  costHttp,
  youtubeClipsHttp,
  youtubeClipsPotProvider,
  quitDiaryHttp,
  cloudpetHttp,
  tradingSystemHttp,
  liftLogHttp,
  ourDaysHttp,
} from "./http";
import { ourDaysHealth } from "./our-days";
import { liftLogStorage } from "./lift-log";
import { agentCostLoggingParity, recentSpend } from "./cost";
import { youtubeClipsSchema } from "./youtube-clips";
import { quitDiarySchema } from "./quit-diary";
import { cloudpetSchema, cloudpetTick } from "./cloudpet";
import { recentPageviews } from "./umami";
import { pgPing } from "./postgres";
import { tradingSystemFreshness, tradingSystemResearch } from "./trading-system";

const CHECKS: CheckFn[] = [
  // host
  diskUsage,
  dataDiskUsage,
  videoDiskUsage,
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
  // umami
  umamiHttp,
  umamiScript,
  recentPageviews,
  // myblog
  myblogHttp,
  // cost
  costHttp,
  recentSpend,
  agentCostLoggingParity,
  // youtube-clips
  youtubeClipsHttp,
  youtubeClipsPotProvider,
  youtubeClipsSchema,
  // quit-diary
  quitDiaryHttp,
  quitDiarySchema,
  // cloudpet
  cloudpetHttp,
  cloudpetSchema,
  cloudpetTick,
  // trading-system
  tradingSystemHttp,
  tradingSystemFreshness,
  tradingSystemResearch,
  liftLogHttp,
  liftLogStorage,
  ourDaysHttp,
  ourDaysHealth,
];

export async function runAllChecks(): Promise<CheckBundle> {
  const results = await Promise.all(CHECKS.map((c) => runOne(c)));
  return summarize(results);
}
