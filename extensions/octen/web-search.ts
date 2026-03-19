import { Type } from "@sinclair/typebox";
import {
  DEFAULT_CACHE_TTL_MINUTES,
  DEFAULT_TIMEOUT_SECONDS,
  getScopedCredentialValue,
  normalizeCacheKey,
  readCache,
  readResponseText,
  resolveCacheTtlMs,
  resolveSiteName,
  resolveTimeoutSeconds,
  resolveWebSearchProviderCredential,
  setScopedCredentialValue,
  type WebSearchProviderPlugin,
  withTrustedWebToolsEndpoint,
  wrapWebContent,
  writeCache,
} from "openclaw/plugin-sdk/provider-web-search";

const DEFAULT_OCTEN_BASE_URL = "https://api.octen.ai";
const OCTEN_SEARCH_ENDPOINT = "/search";
const OCTEN_WEB_SEARCH_CACHE = new Map<
  string,
  { value: Record<string, unknown>; insertedAt: number; expiresAt: number }
>();

type OctenSearchResult = {
  title?: string;
  url?: string;
  highlight?: string;
  full_content?: string;
  authors?: string[];
  time_published?: string;
  time_last_crawled?: string;
};

type OctenSearchResponse = {
  code?: number;
  msg?: string;
  data?: { query?: string; results?: OctenSearchResult[] };
  meta?: {
    usage?: Record<string, unknown>;
    latency?: Record<string, unknown>;
    warning?: string;
  };
};

function resolveOctenBaseUrl(searchConfig?: Record<string, unknown>): string {
  const octenConfig = searchConfig?.octen;
  if (octenConfig && typeof octenConfig === "object" && !Array.isArray(octenConfig)) {
    const baseUrl = (octenConfig as Record<string, unknown>).baseUrl;
    if (typeof baseUrl === "string" && baseUrl.trim()) {
      return baseUrl.trim();
    }
  }
  return DEFAULT_OCTEN_BASE_URL;
}

function readQuery(args: Record<string, unknown>): string {
  const value = typeof args.query === "string" ? args.query.trim() : "";
  if (!value) {
    throw new Error("query required");
  }
  return value;
}

function readCount(args: Record<string, unknown>): number {
  const raw = args.count;
  const parsed =
    typeof raw === "number" && Number.isFinite(raw)
      ? raw
      : typeof raw === "string" && raw.trim()
        ? Number.parseFloat(raw)
        : 5;
  return Math.max(1, Math.min(10, Math.trunc(parsed)));
}

async function throwOctenApiError(res: Response): Promise<never> {
  const detailResult = await readResponseText(res, { maxBytes: 64_000 });
  throw new Error(`Octen API error (${res.status}): ${detailResult.text || res.statusText}`);
}

async function runOctenSearch(params: {
  query: string;
  count: number;
  apiKey: string;
  baseUrl: string;
  timeoutSeconds: number;
  cacheTtlMs: number;
}): Promise<Record<string, unknown>> {
  const cacheKey = normalizeCacheKey(`octen:${params.query}:${params.count}`);
  const cached = readCache(OCTEN_WEB_SEARCH_CACHE, cacheKey);
  if (cached) {
    return { ...cached.value, cached: true };
  }

  const startedAt = Date.now();
  const payload = await withTrustedWebToolsEndpoint(
    {
      url: `${params.baseUrl}${OCTEN_SEARCH_ENDPOINT}`,
      timeoutSeconds: params.timeoutSeconds,
      init: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": params.apiKey,
        },
        body: JSON.stringify({
          query: params.query,
          count: params.count,
        }),
      },
    },
    async ({ response }) => {
      if (!response.ok) {
        return await throwOctenApiError(response);
      }

      const data = (await response.json()) as OctenSearchResponse;

      if (data.code !== undefined && data.code !== 0) {
        throw new Error(`Octen API error (code ${data.code}): ${data.msg || "unknown error"}`);
      }

      const results = Array.isArray(data.data?.results) ? (data.data?.results ?? []) : [];
      return {
        query: params.query,
        provider: "octen",
        count: results.length,
        tookMs: Date.now() - startedAt,
        externalContent: {
          untrusted: true,
          source: "web_search",
          provider: "octen",
          wrapped: true,
        },
        results: results.map((entry) => {
          const title = entry.title ?? "";
          const snippet = entry.highlight || entry.full_content || "";
          const url = entry.url ?? "";
          return {
            title: title ? wrapWebContent(title, "web_search") : "",
            url,
            description: snippet ? wrapWebContent(snippet, "web_search") : "",
            published: entry.time_published || undefined,
            siteName: resolveSiteName(url) || undefined,
          };
        }),
      };
    },
  );

  writeCache(OCTEN_WEB_SEARCH_CACHE, cacheKey, payload, params.cacheTtlMs);
  return payload;
}

export function createOctenWebSearchProvider(): WebSearchProviderPlugin {
  return {
    id: "octen",
    label: "Octen Search",
    hint: "Octen AI-powered search",
    envVars: ["OCTEN_API_KEY"],
    placeholder: "octen-...",
    signupUrl: "https://octen.ai/",
    docsUrl: "https://docs.openclaw.ai/tools/web",
    autoDetectOrder: 70,
    credentialPath: "plugins.entries.octen.config.webSearch.apiKey",
    inactiveSecretPaths: ["plugins.entries.octen.config.webSearch.apiKey"],
    getCredentialValue: (searchConfig?: Record<string, unknown>) =>
      getScopedCredentialValue(searchConfig, "octen"),
    setCredentialValue: (searchConfigTarget: Record<string, unknown>, value: unknown) =>
      setScopedCredentialValue(searchConfigTarget, "octen", value),
    createTool: (ctx: { searchConfig?: Record<string, unknown> }) => ({
      description:
        "Search the web using Octen. Returns search results with titles, URLs, highlights, and optional full content extraction.",
      parameters: Type.Object({
        query: Type.String({ description: "Search query string." }),
        count: Type.Optional(
          Type.Number({
            description: "Number of results to return (1-10).",
            minimum: 1,
            maximum: 10,
          }),
        ),
      }),
      execute: async (args: Record<string, unknown>) => {
        const apiKey = resolveWebSearchProviderCredential({
          credentialValue: getScopedCredentialValue(ctx.searchConfig, "octen"),
          path: "tools.web.search.octen.apiKey",
          envVars: ["OCTEN_API_KEY"],
        });

        if (!apiKey) {
          return {
            error: "missing_octen_api_key",
            message:
              "web_search (octen) needs an Octen API key. Set OCTEN_API_KEY in the Gateway environment, or configure plugins.entries.octen.config.webSearch.apiKey.",
            docs: "https://docs.openclaw.ai/tools/web",
          };
        }

        const query = readQuery(args);
        const count = readCount(args);
        return await runOctenSearch({
          query,
          count,
          apiKey,
          baseUrl: resolveOctenBaseUrl(ctx.searchConfig),
          timeoutSeconds: resolveTimeoutSeconds(
            (ctx.searchConfig?.timeoutSeconds as number | undefined) ?? undefined,
            DEFAULT_TIMEOUT_SECONDS,
          ),
          cacheTtlMs: resolveCacheTtlMs(
            (ctx.searchConfig?.cacheTtlMinutes as number | undefined) ?? undefined,
            DEFAULT_CACHE_TTL_MINUTES,
          ),
        });
      },
    }),
  };
}
