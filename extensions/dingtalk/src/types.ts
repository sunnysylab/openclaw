// DingTalk Stream API / Webhook inbound message types.
// Reference: https://open.dingtalk.com/document/orgapp/receive-message

/** Sender info in a DingTalk message. */
export type DingTalkSender = {
  staffId?: string;
  dingtalkId?: string;
  nickname?: string;
  avatarUrl?: string;
};

/** Conversation (group or DM) info. */
export type DingTalkConversation = {
  id?: string;
  title?: string;
  /** "1" for DM, "2" for group */
  type?: string;
};

/** Rich content element for picture messages. */
export type DingTalkPicContent = {
  downloadCode?: string;
  mediaId?: string;
  fileSize?: string;
};

/** Rich content element for file messages. */
export type DingTalkFileContent = {
  downloadCode?: string;
  mediaId?: string;
  fileSize?: string;
  fileName?: string;
};

/** Rich content element for audio messages. */
export type DingTalkAudioContent = {
  downloadCode?: string;
  mediaId?: string;
  duration?: string;
};

/** Rich content element for video messages. */
export type DingTalkVideoContent = {
  downloadCode?: string;
  mediaId?: string;
  duration?: string;
  videoType?: string;
};

/** Union of DingTalk inbound message content types. */
export type DingTalkMessageContent =
  | { msgtype: "text"; text: { content: string } }
  | { msgtype: "picture"; content: DingTalkPicContent }
  | { msgtype: "file"; content: DingTalkFileContent }
  | { msgtype: "audio"; content: DingTalkAudioContent }
  | { msgtype: "video"; content: DingTalkVideoContent }
  | { msgtype: "richText"; content: { richText: unknown[] } }
  | { msgtype: string; [key: string]: unknown };

/** Full inbound event payload from DingTalk. */
export type DingTalkInboundEvent = {
  msgtype?: string;
  msgId?: string;
  text?: { content: string };
  content?: unknown;
  senderStaffId?: string;
  senderNick?: string;
  senderDingtalkId?: string;
  senderCorpId?: string;
  chatbotUserId?: string;
  chatbotCorpId?: string;
  conversationId?: string;
  conversationTitle?: string;
  /** "1" = single/DM, "2" = group */
  conversationType?: string;
  isAdmin?: boolean;
  isInAtList?: boolean;
  atUsers?: Array<{ dingtalkId?: string; staffId?: string }>;
  sessionWebhook?: string;
  sessionWebhookExpiredTime?: number;
  robotCode?: string;
  createAt?: number;
};

/** Outbound text message body sent via Stream API reply or webhook. */
export type DingTalkOutboundTextMsg = {
  msgtype: "text";
  text: { content: string };
};

/** Outbound markdown message body. */
export type DingTalkOutboundMarkdownMsg = {
  msgtype: "markdown";
  markdown: {
    title: string;
    text: string;
  };
};

/** Outbound action card (single button). */
export type DingTalkOutboundActionCard = {
  msgtype: "actionCard";
  actionCard: {
    title: string;
    text: string;
    singleTitle?: string;
    singleURL?: string;
    btnOrientation?: "0" | "1";
    btns?: Array<{ title: string; actionURL: string }>;
  };
};

export type DingTalkOutboundMsg =
  | DingTalkOutboundTextMsg
  | DingTalkOutboundMarkdownMsg
  | DingTalkOutboundActionCard;

/** Response from the DingTalk send message API. */
export type DingTalkSendMessageResponse = {
  processQueryKey?: string;
  errcode?: number;
  errmsg?: string;
};

/** Stream API event envelope (for client-side event streaming mode). */
export type DingTalkStreamEventEnvelope = {
  specversion?: string;
  type?: string;
  source?: string;
  id?: string;
  time?: string;
  datacontenttype?: string;
  data?: string;
  headers?: {
    eventCorpId?: string;
    eventId?: string;
    eventBornTime?: string;
    eventType?: string;
    eventUnifiedAppId?: string;
    appId?: string;
    contentType?: string;
    message?: string;
    topic?: string;
    taskId?: string;
  };
};
