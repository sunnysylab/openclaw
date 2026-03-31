import type { DmPolicy, GroupPolicy } from "./types.base.js";
import type { ChannelHealthMonitorConfig } from "./types.channels.js";
import type { DmConfig } from "./types.messages.js";

export type DingTalkDmConfig = {
  /** If false, ignore all incoming DingTalk DMs. Default: true. */
  enabled?: boolean;
  /** Direct message access policy (default: pairing). */
  policy?: DmPolicy;
  /** Allowlist for DM senders (staffId or dingtalkId values). */
  allowFrom?: Array<string | number>;
};

export type DingTalkGroupConfig = {
  /** If false, disable the bot in this group. */
  enabled?: boolean;
  /** Require mentioning the bot to trigger replies. */
  requireMention?: boolean;
  /** Allowlist of users that can invoke the bot in this group. */
  users?: Array<string | number>;
  /** Optional system prompt override for this group. */
  systemPrompt?: string;
};

export type DingTalkAccountConfig = {
  /** Optional display name for this account. */
  name?: string;
  /** If false, do not start this DingTalk account. Default: true. */
  enabled?: boolean;
  /**
   * DingTalk App Key (clientId) from the Open Platform.
   * Used for Stream API and proactive messaging.
   */
  clientId?: string;
  /**
   * DingTalk App Secret (clientSecret) from the Open Platform.
   * Also used as the webhook signature secret.
   */
  clientSecret?: string;
  /** Legacy: App Key field (alias for clientId). */
  appKey?: string;
  /** Legacy: App Secret field (alias for clientSecret). */
  appSecret?: string;
  /**
   * DingTalk robot code (robotCode field in the open platform app).
   * Required for proactive messaging via OpenAPI.
   */
  robotCode?: string;
  /** DingTalk webhook path (default: /dingtalk/<accountId>). */
  webhookPath?: string;
  /** DingTalk webhook URL (used to derive the path). */
  webhookUrl?: string;
  /** Default group/DM target id for CLI --deliver. */
  defaultTo?: string;
  /** Group policy for incoming group messages (default: allowlist). */
  groupPolicy?: GroupPolicy;
  /** Per-group configuration keyed by conversationId. */
  groups?: Record<string, DingTalkGroupConfig>;
  /** DM access configuration. */
  dm?: DingTalkDmConfig;
  /** Per-DM config overrides keyed by staffId. */
  dms?: Record<string, DmConfig>;
  /** Outbound text chunk size (chars). Default: 2000. */
  textChunkLimit?: number;
  blockStreaming?: boolean;
  mediaMaxMb?: number;
  /** Channel health monitor overrides. */
  healthMonitor?: ChannelHealthMonitorConfig;
};

export type DingTalkConfig = {
  /** Optional per-account DingTalk configuration (multi-account). */
  accounts?: Record<string, DingTalkAccountConfig>;
  /** Optional default account id when multiple accounts are configured. */
  defaultAccount?: string;
} & DingTalkAccountConfig;
