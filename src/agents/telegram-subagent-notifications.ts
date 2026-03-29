import type { TelegramAccountConfig } from "../config/types.telegram.js";
import { resolveTelegramAccount } from "../plugin-sdk/telegram-account.js";

/**
 * Resolves Telegram subagent notification flags from the resolved account config.
 * Both default to false if not specified — users opt-in to these notices.
 */
export function resolveTelegramSubagentNoticeFlags(
  cfg: Record<string, unknown>,
  accountId?: string,
): { subagentStartAnnouncements: boolean; modelStatusNotices: boolean } {
  try {
    const resolved = resolveTelegramAccount({ cfg, accountId });
    const accountConfig: Partial<TelegramAccountConfig> = resolved?.config ?? {};
    return {
      subagentStartAnnouncements: accountConfig.subagentStartAnnouncements ?? false,
      modelStatusNotices: accountConfig.modelStatusNotices ?? false,
    };
  } catch {
    return {
      subagentStartAnnouncements: false,
      modelStatusNotices: false,
    };
  }
}

/**
 * Builds the Telegram subagent start notice text.
 */
export function buildTelegramSubagentStartNotice(params: {
  label?: string;
  task?: string;
  model?: string;
}): string {
  const lines: string[] = [];
  const label = (params.label || params.task || "subagent").trim();

  if (label) {
    lines.push(`🚀 Subagent started: ${label.slice(0, 120)}`);
  }
  if (params.task?.trim() && params.task.trim() !== label) {
    lines.push(`Task: ${params.task.trim().slice(0, 180)}`);
  }
  if (params.model?.trim()) {
    lines.push(`Model: ${params.model.trim()}`);
  }

  return lines.join("\n");
}
