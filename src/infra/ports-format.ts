import { formatCliCommand } from "../cli/command-format.js";
import type { PortListener, PortListenerKind, PortUsage } from "./ports-types.js";

export function classifyPortListener(listener: PortListener, port: number): PortListenerKind {
  const raw = `${listener.commandLine ?? ""} ${listener.command ?? ""}`.trim().toLowerCase();
  if (raw.includes("openclaw")) {
    return "gateway";
  }
  if (raw.includes("ssh")) {
    const portToken = String(port);
    const tunnelPattern = new RegExp(
      `-(l|r)\\s*${portToken}\\b|-(l|r)${portToken}\\b|:${portToken}\\b`,
    );
    if (!raw || tunnelPattern.test(raw)) {
      return "ssh";
    }
    return "ssh";
  }
  return "unknown";
}

function normalizeListenerAddress(address: string): string {
  return address
    .replace(/^TCP\s+/i, "")
    .replace(/\s+\(LISTEN\)\s*$/i, "")
    .trim();
}

function extractListenerHost(address: string | undefined): string | null {
  if (!address) {
    return null;
  }
  const normalized = normalizeListenerAddress(address);
  if (!normalized) {
    return null;
  }
  if (normalized.startsWith("[")) {
    const end = normalized.indexOf("]");
    if (end > 1) {
      return normalized.slice(1, end).toLowerCase();
    }
  }
  if (/^[^:]+:\d+$/.test(normalized)) {
    return normalized.replace(/:\d+$/, "").toLowerCase();
  }
  return normalized.toLowerCase();
}

export function isLoopbackDualStackGatewayListenerSet(
  listeners: PortListener[],
  port: number,
): boolean {
  if (listeners.length < 2) {
    return false;
  }
  const pids = listeners.map((listener) => listener.pid);
  if (pids.some((pid) => !Number.isFinite(pid))) {
    return false;
  }
  if (new Set(pids).size !== 1) {
    return false;
  }
  if (!listeners.every((listener) => classifyPortListener(listener, port) === "gateway")) {
    return false;
  }
  const hosts = new Set(
    listeners
      .map((listener) => extractListenerHost(listener.address))
      .filter((host): host is string => Boolean(host)),
  );
  return (
    hosts.size >= 2 &&
    hosts.has("127.0.0.1") &&
    hosts.has("::1") &&
    [...hosts].every((host) => host === "127.0.0.1" || host === "::1")
  );
}

export function buildPortHints(listeners: PortListener[], port: number): string[] {
  if (listeners.length === 0) {
    return [];
  }
  const kinds = new Set(listeners.map((listener) => classifyPortListener(listener, port)));
  const hints: string[] = [];
  if (kinds.has("gateway")) {
    hints.push(
      `Gateway already running locally. Stop it (${formatCliCommand("openclaw gateway stop")}) or use a different port.`,
    );
  }
  if (kinds.has("ssh")) {
    hints.push(
      "SSH tunnel already bound to this port. Close the tunnel or use a different local port in -L.",
    );
  }
  if (kinds.has("unknown")) {
    hints.push("Another process is listening on this port.");
  }
  if (listeners.length > 1) {
    hints.push(
      "Multiple listeners detected; ensure only one gateway/tunnel per port unless intentionally running isolated profiles.",
    );
  }
  return hints;
}

export function formatPortListener(listener: PortListener): string {
  const pid = listener.pid ? `pid ${listener.pid}` : "pid ?";
  const user = listener.user ? ` ${listener.user}` : "";
  const command = listener.commandLine || listener.command || "unknown";
  const address = listener.address ? ` (${listener.address})` : "";
  return `${pid}${user}: ${command}${address}`;
}

export function formatPortDiagnostics(diagnostics: PortUsage): string[] {
  if (diagnostics.status !== "busy") {
    return [`Port ${diagnostics.port} is free.`];
  }
  const lines = [`Port ${diagnostics.port} is already in use.`];
  for (const listener of diagnostics.listeners) {
    lines.push(`- ${formatPortListener(listener)}`);
  }
  for (const hint of diagnostics.hints) {
    lines.push(`- ${hint}`);
  }
  return lines;
}
