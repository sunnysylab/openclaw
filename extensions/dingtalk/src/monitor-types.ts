import type { OpenClawConfig } from "openclaw/plugin-sdk/core";
import type { ResolvedDingTalkAccount } from "./accounts.js";
import { getDingTalkRuntime } from "./runtime.js";

/** Runtime environment passed to the monitor from the gateway context. */
export type DingTalkRuntimeEnv = {
  log?: (msg: string) => void;
  error?: (msg: string) => void;
};

/** Status update sink for updating account state in the gateway. */
export type DingTalkStatusSink = (update: Record<string, unknown>) => void;

export type DingTalkCoreRuntime = ReturnType<typeof getDingTalkRuntime>;

/** A registered webhook target mapping a path to an account + runtime. */
export type DingTalkWebhookTarget = {
  path: string;
  account: ResolvedDingTalkAccount;
  config: OpenClawConfig;
  runtime: DingTalkRuntimeEnv;
  core: DingTalkCoreRuntime;
  statusSink?: DingTalkStatusSink;
};

/** Options passed to startDingTalkMonitor. */
export type DingTalkMonitorOptions = {
  account: ResolvedDingTalkAccount;
  config: OpenClawConfig;
  abortSignal?: AbortSignal;
  runtime: DingTalkRuntimeEnv;
  statusSink?: DingTalkStatusSink;
  webhookPath?: string;
  webhookUrl?: string;
};
