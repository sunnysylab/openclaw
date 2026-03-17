// Translate wrapper chat lifecycle events into sidecar mood updates.
import { sendEvent, sendReply } from './sidecarClient.mjs';

export async function onUserPrompt() {
  return sendEvent('task-start');
}

export async function onAssistantFinal(text) {
  if (typeof text === 'string' && text.trim()) {
    return sendReply(text);
  }
  return sendEvent('assistant-idle');
}

export async function onAssistantError() {
  return sendEvent('task-error');
}
