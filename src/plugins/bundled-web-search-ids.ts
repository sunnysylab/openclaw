export const BUNDLED_WEB_SEARCH_PLUGIN_IDS = [
  "brave",
  "duckduckgo",
  "exa",
  "firecrawl",
  "google",
  "minimax",
  "moonshot",
  "perplexity",
  "tavily",
  "xai",
] as const;

export function listBundledWebSearchPluginIds(): string[] {
  return [...BUNDLED_WEB_SEARCH_PLUGIN_IDS];
}
