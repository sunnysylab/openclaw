import { bluebubblesPlugin } from "../../../extensions/bluebubbles/index.js";
import { discordPlugin, setDiscordRuntime } from "../../../extensions/discord/index.js";
import { discordSetupPlugin } from "../../../extensions/discord/setup-entry.js";
import { feishuPlugin } from "../../../extensions/feishu/index.js";
import { imessagePlugin } from "../../../extensions/imessage/index.js";
import { imessageSetupPlugin } from "../../../extensions/imessage/setup-entry.js";
import { ircPlugin } from "../../../extensions/irc/index.js";
import { linePlugin, setLineRuntime } from "../../../extensions/line/index.js";
import { lineSetupPlugin } from "../../../extensions/line/setup-entry.js";
import { mattermostPlugin } from "../../../extensions/mattermost/index.js";
import { nextcloudTalkPlugin } from "../../../extensions/nextcloud-talk/index.js";
import { signalPlugin } from "../../../extensions/signal/index.js";
import { signalSetupPlugin } from "../../../extensions/signal/setup-entry.js";
import { slackPlugin } from "../../../extensions/slack/index.js";
import { slackSetupPlugin } from "../../../extensions/slack/setup-entry.js";
import { synologyChatPlugin } from "../../../extensions/synology-chat/index.js";
import { telegramPlugin, setTelegramRuntime } from "../../../extensions/telegram/index.js";
import { telegramSetupPlugin } from "../../../extensions/telegram/setup-entry.js";
import { zaloPlugin } from "../../../extensions/zalo/index.js";
import type { ChannelId, ChannelPlugin } from "./types.js";

export const bundledChannelPlugins = [
  bluebubblesPlugin,
  discordPlugin,
  feishuPlugin,
  imessagePlugin,
  ircPlugin,
  linePlugin,
  mattermostPlugin,
  nextcloudTalkPlugin,
  signalPlugin,
  slackPlugin,
  synologyChatPlugin,
  telegramPlugin,
  zaloPlugin,
] as ChannelPlugin[];

export const bundledChannelSetupPlugins = [
  telegramSetupPlugin,
  discordSetupPlugin,
  ircPlugin,
  slackSetupPlugin,
  signalSetupPlugin,
  imessageSetupPlugin,
  lineSetupPlugin,
] as ChannelPlugin[];

function buildBundledChannelPluginsById(plugins: readonly ChannelPlugin[]) {
  const byId = new Map<ChannelId, ChannelPlugin>();
  for (const plugin of plugins) {
    if (byId.has(plugin.id)) {
      throw new Error(`duplicate bundled channel plugin id: ${plugin.id}`);
    }
    byId.set(plugin.id, plugin);
  }
  return byId;
}

type BundledChannelState = {
  entries: readonly GeneratedBundledChannelEntry[];
  plugins: readonly ChannelPlugin[];
  setupPlugins: readonly ChannelPlugin[];
  pluginsById: Map<ChannelId, ChannelPlugin>;
  runtimeSettersById: Map<
    ChannelId,
    NonNullable<GeneratedBundledChannelEntry["entry"]["setChannelRuntime"]>
  >;
};

let cachedBundledChannelState: BundledChannelState | null = null;

function getBundledChannelState(): BundledChannelState {
  if (cachedBundledChannelState) {
    return cachedBundledChannelState;
  }

  const entries = loadGeneratedBundledChannelEntries();
  const plugins = entries.map(({ entry }) => entry.channelPlugin);
  const setupPlugins = entries.flatMap(({ setupEntry }) => {
    const plugin = setupEntry?.plugin;
    return plugin ? [plugin] : [];
  });
  const runtimeSettersById = new Map<
    ChannelId,
    NonNullable<GeneratedBundledChannelEntry["entry"]["setChannelRuntime"]>
  >();
  for (const { entry } of entries) {
    if (entry.setChannelRuntime) {
      runtimeSettersById.set(entry.channelPlugin.id, entry.setChannelRuntime);
    }
  }

  cachedBundledChannelState = {
    entries,
    plugins,
    setupPlugins,
    pluginsById: buildBundledChannelPluginsById(plugins),
    runtimeSettersById,
  };
  return cachedBundledChannelState;
}

export function listBundledChannelPlugins(): readonly ChannelPlugin[] {
  return getBundledChannelState().plugins;
}

export function listBundledChannelSetupPlugins(): readonly ChannelPlugin[] {
  return getBundledChannelState().setupPlugins;
}

export function getBundledChannelPlugin(id: ChannelId): ChannelPlugin | undefined {
  return getBundledChannelState().pluginsById.get(id);
}

export function requireBundledChannelPlugin(id: ChannelId): ChannelPlugin {
  const plugin = getBundledChannelPlugin(id);
  if (!plugin) {
    throw new Error(`missing bundled channel plugin: ${id}`);
  }
  return plugin;
}

export const bundledChannelRuntimeSetters = {
  setDiscordRuntime,
  setLineRuntime,
  setTelegramRuntime,
};
