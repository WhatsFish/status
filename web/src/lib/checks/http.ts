import type { CheckFn } from "../runner";

const HOST = process.env.PUBLIC_HOST ?? "ai-native.japaneast.cloudapp.azure.com";

function probe(id: string, group: string, name: string, path: string, expected = 200): CheckFn {
  return async () => {
    const url = `https://${HOST}${path}`;
    const started = Date.now();
    try {
      const r = await fetch(url, { redirect: "manual" });
      const elapsed = Date.now() - started;
      // Treat 2xx as ok, 3xx as ok (redirect intact), 4xx as warn (auth wall is normal),
      // 5xx as fail.
      const status = r.status;
      const sev = status >= 500 ? "fail" : status >= 400 ? "warn" : "ok";
      return {
        id,
        group,
        name,
        status: sev,
        detail: `HTTP ${status} in ${elapsed}ms`,
      };
    } catch (e) {
      return {
        id,
        group,
        name,
        status: "fail",
        detail: e instanceof Error ? e.message : "fetch failed",
      };
    }
  };
}

export const aiFeedHttp = probe("ai-feed-http", "ai-feed", "Web (/feed)", "/feed/login");
export const aiPlaygroundHttp = probe("ai-playground-http", "ai-playground", "Web (/chat)", "/chat");
export const vpnMonitorHttp = probe("vpn-monitor-http", "vpn", "Dashboard (/vpn)", "/vpn");
export const umamiHttp = probe("umami-http", "umami", "Dashboard (/umami)", "/umami");
export const umamiScript = probe("umami-script", "umami", "Tracking script (/umami/script.js)", "/umami/script.js");
export const myblogHttp = probe("myblog-http", "myblog", "Blog (/myblog)", "/myblog/");
export const indexHttp = probe("index-http", "host", "Service catalog (/)", "/");
export const costHttp = probe("cost-http", "cost", "Dashboard (/cost)", "/cost");
