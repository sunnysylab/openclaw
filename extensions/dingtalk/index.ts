import type { ChannelPlugin } from "openclaw/plugin-sdk/core";
import { defineChannelPluginEntry } from "openclaw/plugin-sdk/core";
import { dingtalkPlugin } from "./src/channel.js";
import { setDingTalkRuntime } from "./src/runtime.js";

export { dingtalkPlugin } from "./src/channel.js";
export { setDingTalkRuntime } from "./src/runtime.js";

export default defineChannelPluginEntry({
  id: "dingtalk",
  name: "DingTalk",
  description: "OpenClaw DingTalk channel plugin",
  plugin: dingtalkPlugin as ChannelPlugin,
  setRuntime: setDingTalkRuntime,
});
