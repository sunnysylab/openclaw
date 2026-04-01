import { danger } from "openclaw/plugin-sdk/runtime-env";
import type { RuntimeEnv } from "openclaw/plugin-sdk/runtime-env";
import { attachDiscordGatewayLogging } from "../gateway-logging.js";
import { getDiscordGatewayEmitter, waitForDiscordGatewayStop } from "../monitor.gateway.js";
import type { DiscordVoiceManager } from "../voice/manager.js";
import type { MutableDiscordGateway } from "./gateway-handle.js";
import { registerGateway, unregisterGateway } from "./gateway-registry.js";
import type { DiscordGatewayEvent, DiscordGatewaySupervisor } from "./gateway-supervisor.js";
import { createDiscordGatewayReconnectController } from "./provider.lifecycle.reconnect.js";
import type { DiscordMonitorStatusSink } from "./status.js";

type ExecApprovalsHandler = {
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

export async function runDiscordGatewayLifecycle(params: {
  accountId: string;
  gateway?: MutableDiscordGateway;
  runtime: RuntimeEnv;
  abortSignal?: AbortSignal;
  isDisallowedIntentsError: (err: unknown) => boolean;
  voiceManager: DiscordVoiceManager | null;
  voiceManagerRef: { current: DiscordVoiceManager | null };
  execApprovalsHandler: ExecApprovalsHandler | null;
  threadBindings: { stop: () => void };
  gatewaySupervisor: DiscordGatewaySupervisor;
  statusSink?: DiscordMonitorStatusSink;
}) {
  const gateway = params.gateway;
  if (gateway) {
    registerGateway(params.accountId, gateway);
  }
  const gatewayEmitter = params.gatewaySupervisor.emitter ?? getDiscordGatewayEmitter(gateway);
  const stopGatewayLogging = attachDiscordGatewayLogging({
    emitter: gatewayEmitter,
    runtime: params.runtime,
  });
  let lifecycleStopping = false;

  const pushStatus = (patch: Parameters<DiscordMonitorStatusSink>[0]) => {
    params.statusSink?.(patch);
  };
  const reconnectController = createDiscordGatewayReconnectController({
    accountId: params.accountId,
    gateway,
    runtime: params.runtime,
    abortSignal: params.abortSignal,
    pushStatus,
    isLifecycleStopping: () => lifecycleStopping,
    drainPendingGatewayErrors: (phase: "startup" | "poll") => drainPendingGatewayErrors(phase),
  });
  const onGatewayDebug = reconnectController.onGatewayDebug;
  gatewayEmitter?.on("debug", onGatewayDebug);

  let sawDisallowedIntents = false;
  const handleGatewayEvent = (event: DiscordGatewayEvent): "continue" | "stop" => {
    if (event.type === "disallowed-intents") {
      sawDisallowedIntents = true;
      params.runtime.error?.(
        danger(
          "discord: gateway closed with code 4014 (missing privileged gateway intents). Enable the required intents in the Discord Developer Portal or disable them in config.",
        ),
      );
      return "stop";
    }
    // When we deliberately set maxAttempts=0 and disconnected (health-monitor
    // stale-socket restart), Carbon fires "Max reconnect attempts (0)". This
    // is expected — log at info instead of error to avoid false alarms.
    // Even outside shutdown, reconnect exhaustion must never crash the gateway
    // process — stop the lifecycle gracefully so the health monitor can retry.
    if (event.type === "reconnect-exhausted") {
      if (lifecycleStopping || params.abortSignal?.aborted === true) {
        params.runtime.log?.(
          `discord: ignoring expected reconnect-exhausted during shutdown: ${event.message}`,
        );
      } else {
        params.runtime.error?.(
          danger(
            `discord: reconnect attempts exhausted: ${event.message}. The gateway lifecycle will stop gracefully instead of crashing the process.`,
          ),
        );
      }
      return "stop";
    }
    params.runtime.error?.(danger(`discord gateway error: ${event.message}`));
    return event.shouldStopLifecycle ? "stop" : "continue";
  };
  const drainPendingGatewayErrors = (phase: "startup" | "poll"): "continue" | "stop" =>
    params.gatewaySupervisor.drainPending((event) => {
      const decision = handleGatewayEvent(event);
      if (decision !== "stop") {
        return "continue";
      }
      if (event.type === "disallowed-intents") {
        return "stop";
      }
      if (
        event.type === "reconnect-exhausted" &&
        (phase === "poll" || lifecycleStopping || params.abortSignal?.aborted === true)
      ) {
        return "stop";
      }
      throw event.err;
    });
  try {
    if (params.execApprovalsHandler) {
      await params.execApprovalsHandler.start();
    }

    // Drain gateway errors emitted before lifecycle listeners were attached.
    if (drainPendingGatewayErrors("startup") === "stop") {
      return;
    }

    await reconnectController.ensureStartupReady();

    if (drainPendingGatewayErrors("poll") === "stop") {
      return;
    }

    await waitForDiscordGatewayStop({
      gateway: gateway
        ? {
            disconnect: () => gateway.disconnect(),
          }
        : undefined,
      abortSignal: params.abortSignal,
      gatewaySupervisor: params.gatewaySupervisor,
      onGatewayEvent: handleGatewayEvent,
      registerForceStop: reconnectController.registerForceStop,
    });
  } catch (err) {
    // Reconnect exhaustion should stop the lifecycle gracefully, not crash
    // the entire gateway process. The error has already been logged above.
    const isReconnectExhausted = /Max reconnect attempts/i.test(String(err));
    if (!isReconnectExhausted && !sawDisallowedIntents && !params.isDisallowedIntentsError(err)) {
      throw err;
    }
  } finally {
    lifecycleStopping = true;
    params.gatewaySupervisor.detachLifecycle();
    unregisterGateway(params.accountId);
    stopGatewayLogging();
    reconnectController.dispose();
    gatewayEmitter?.removeListener("debug", onGatewayDebug);
    if (params.voiceManager) {
      await params.voiceManager.destroy();
      params.voiceManagerRef.current = null;
    }
    if (params.execApprovalsHandler) {
      await params.execApprovalsHandler.stop();
    }
    params.threadBindings.stop();
  }
}
