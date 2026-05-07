import { promises as fs } from "fs";
import { execFile } from "child_process";
import { promisify } from "util";
import { cpus } from "os";
import type { CheckFn } from "../runner";

const execAsync = promisify(execFile);

function fmtPercent(v: number): string {
  return `${v.toFixed(1)}%`;
}

function fmtDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

/**
 * Disk usage of the container's root mount, which under docker overlay2
 * reports the host's underlying filesystem. Reads via `df` since it's
 * easier than parsing /proc/mounts + /sys/block.
 */
export const diskUsage: CheckFn = async () => {
  const { stdout } = await execAsync("df", ["-P", "/"]);
  const line = stdout.trim().split("\n").at(-1) ?? "";
  const parts = line.split(/\s+/);
  // Filesystem 1024-blocks Used Available Capacity Mounted
  const usedPct = parseFloat(parts[4]?.replace("%", "") ?? "0");
  const avail = parts[3] ?? "?";
  const total = parts[1] ?? "?";
  return {
    id: "host-disk",
    group: "host",
    name: "Disk usage (/)",
    status: usedPct > 95 ? "fail" : usedPct > 80 ? "warn" : "ok",
    detail: `${fmtPercent(usedPct)} used; ${parseInt(avail, 10) / 1024 / 1024 < 1 ? `${(parseInt(avail, 10) / 1024).toFixed(0)} MB` : `${(parseInt(avail, 10) / 1024 / 1024).toFixed(1)} GB`} free of ${(parseInt(total, 10) / 1024 / 1024).toFixed(1)} GB`,
  };
};

/** /proc is the host's, not container-namespaced (kernel pseudo-FS). */
export const memory: CheckFn = async () => {
  const meminfo = await fs.readFile("/proc/meminfo", "utf-8");
  const get = (key: string) => parseInt(meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1] ?? "0", 10);
  const total = get("MemTotal");
  const available = get("MemAvailable");
  const used = total - available;
  const pct = total === 0 ? 0 : (used / total) * 100;
  return {
    id: "host-mem",
    group: "host",
    name: "Memory",
    status: pct > 95 ? "fail" : pct > 85 ? "warn" : "ok",
    detail: `${fmtPercent(pct)} used (${(used / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} GiB)`,
  };
};

export const swap: CheckFn = async () => {
  const meminfo = await fs.readFile("/proc/meminfo", "utf-8");
  const get = (key: string) => parseInt(meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, "m"))?.[1] ?? "0", 10);
  const total = get("SwapTotal");
  const free = get("SwapFree");
  if (total === 0) {
    return {
      id: "host-swap",
      group: "host",
      name: "Swap",
      status: "warn",
      detail: "no swap configured",
    };
  }
  const used = total - free;
  const pct = (used / total) * 100;
  return {
    id: "host-swap",
    group: "host",
    name: "Swap",
    // Sustained heavy swap = memory pressure. <50% used is normal.
    status: pct > 80 ? "fail" : pct > 50 ? "warn" : "ok",
    detail: `${fmtPercent(pct)} of ${(total / 1024 / 1024).toFixed(1)} GiB used`,
  };
};

export const loadavg: CheckFn = async () => {
  const txt = await fs.readFile("/proc/loadavg", "utf-8");
  const [one, five, fifteen] = txt.split(" ").slice(0, 3).map(parseFloat);
  const cores = cpus().length;
  return {
    id: "host-load",
    group: "host",
    name: "Load average",
    status: one > cores * 2 ? "fail" : one > cores ? "warn" : "ok",
    detail: `${one.toFixed(2)} / ${five.toFixed(2)} / ${fifteen.toFixed(2)} (${cores} cores)`,
  };
};

export const uptime: CheckFn = async () => {
  const txt = await fs.readFile("/proc/uptime", "utf-8");
  const seconds = parseFloat(txt.split(" ")[0]);
  return {
    id: "host-uptime",
    group: "host",
    name: "Uptime",
    status: "ok",
    detail: fmtDuration(seconds),
  };
};
