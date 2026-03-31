import {
  resolveDingTalkWebhookPath as resolveDingTalkWebhookPathImpl,
  startDingTalkMonitor as startDingTalkMonitorImpl,
} from "./monitor.js";
import {
  probeDingTalk as probeDingTalkImpl,
  sendDingTalkProactiveMessage as sendDingTalkProactiveMessageImpl,
  sendDingTalkSessionWebhookMessage as sendDingTalkSessionWebhookMessageImpl,
} from "./send.js";

export const dingtalkChannelRuntime = {
  probeDingTalk: probeDingTalkImpl,
  sendDingTalkProactiveMessage: sendDingTalkProactiveMessageImpl,
  sendDingTalkSessionWebhookMessage: sendDingTalkSessionWebhookMessageImpl,
  resolveDingTalkWebhookPath: resolveDingTalkWebhookPathImpl,
  startDingTalkMonitor: startDingTalkMonitorImpl,
};
