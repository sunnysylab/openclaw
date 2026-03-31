import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "../runtime-api.js";

const { setRuntime: setDingTalkRuntime, getRuntime: getDingTalkRuntime } =
  createPluginRuntimeStore<PluginRuntime>("DingTalk runtime not initialized");
export { getDingTalkRuntime, setDingTalkRuntime };
