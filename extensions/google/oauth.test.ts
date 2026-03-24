import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/infra/wsl.js", () => ({
  isWSL2Sync: () => false,
}));

vi.mock("../../src/infra/net/fetch-guard.js", () => ({
  fetchWithSsrFGuard: async (params: {
    url: string;
    init?: RequestInit;
    fetchImpl?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  }) => {
    const fetchImpl = params.fetchImpl ?? globalThis.fetch;
    const response = await fetchImpl(params.url, params.init);
    return {
      response,
      finalUrl: params.url,
      release: async () => {},
    };
  },
}));

describe("loginGeminiCliOAuth", () => {
  const TOKEN_URL = "https://oauth2.googleapis.com/token";
  const USERINFO_URL = "https://www.googleapis.com/oauth2/v1/userinfo?alt=json";
  const LOAD_PROD = "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist";
  const LOAD_DAILY = "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist";
  const LOAD_AUTOPUSH =
    "https://autopush-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist";

  const ENV_KEYS = [
    "OPENCLAW_GEMINI_OAUTH_CLIENT_ID",
    "OPENCLAW_GEMINI_OAUTH_CLIENT_SECRET",
    "GEMINI_CLI_OAUTH_CLIENT_ID",
    "GEMINI_CLI_OAUTH_CLIENT_SECRET",
    "GOOGLE_CLOUD_PROJECT",
    "GOOGLE_CLOUD_PROJECT_ID",
  ] as const;

  function getExpectedPlatform(): "WINDOWS" | "MACOS" | "PLATFORM_UNSPECIFIED" {
    if (process.platform === "win32") {
      return "WINDOWS";
    }
    if (process.platform === "darwin") {
      return "MACOS";
    }
    // Matches updated resolvePlatform() which uses PLATFORM_UNSPECIFIED for Linux
    return "PLATFORM_UNSPECIFIED";
  }

  function getRequestUrl(input: string | URL | Request): string {
    return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  }

  function getHeaderValue(headers: HeadersInit | undefined, name: string): string | undefined {
    if (!headers) {
      return undefined;
    }
    if (headers instanceof Headers) {
      return headers.get(name) ?? undefined;
    }
    if (Array.isArray(headers)) {
      return headers.find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
    }
    return (headers as Record<string, string>)[name];
  }

  function responseJson(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  type LoginGeminiCliOAuthFn = (options: {
    isRemote: boolean;
    openUrl: () => Promise<void>;
    log: (msg: string) => void;
    note: () => Promise<void>;
    prompt: () => Promise<string>;
    progress: { update: () => void; stop: () => void };
  }) => Promise<{ projectId: string }>;

  async function runRemoteLoginWithCapturedAuthUrl(loginGeminiCliOAuth: LoginGeminiCliOAuthFn) {
    let authUrl = "";
    const result = await loginGeminiCliOAuth({
      isRemote: true,
      openUrl: async () => {},
      log: (msg) => {
        const found = msg.match(/https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?[^\s]+/);
        if (found?.[0]) {
          authUrl = found[0];
        }
      },
      note: async () => {},
      prompt: async () => {
        const state = new URL(authUrl).searchParams.get("state");
        return `${"http://localhost:8085/oauth2callback"}?code=oauth-code&state=${state}`;
      },
      progress: { update: () => {}, stop: () => {} },
    });
    return { result, authUrl };
  }

  async function runRemoteLoginExpectingProjectId(
    loginGeminiCliOAuth: LoginGeminiCliOAuthFn,
    projectId: string,
  ) {
    const { result } = await runRemoteLoginWithCapturedAuthUrl(loginGeminiCliOAuth);
    expect(result.projectId).toBe(projectId);
  }

  let envSnapshot: Partial<Record<(typeof ENV_KEYS)[number], string>>;
  beforeEach(() => {
    envSnapshot = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
    process.env.OPENCLAW_GEMINI_OAUTH_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
    process.env.OPENCLAW_GEMINI_OAUTH_CLIENT_SECRET = "GOCSPX-test-client-secret"; // pragma: allowlist secret
    delete process.env.GEMINI_CLI_OAUTH_CLIENT_ID;
    delete process.env.GEMINI_CLI_OAUTH_CLIENT_SECRET;
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_CLOUD_PROJECT_ID;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = envSnapshot[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    vi.unstubAllGlobals();
  });

  it("falls back across loadCodeAssist endpoints with aligned headers and metadata", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = getRequestUrl(input);
      requests.push({ url, init });

      if (url === TOKEN_URL) {
        return responseJson({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        });
      }
      if (url === USERINFO_URL) {
        return responseJson({ email: "lobster@openclaw.ai" });
      }
      if (url === LOAD_PROD) {
        return responseJson({ error: { message: "temporary failure" } }, 503);
      }
      if (url === LOAD_DAILY) {
        return responseJson({
          currentTier: { id: "standard-tier" },
          cloudaicompanionProject: { id: "daily-project" },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loginGeminiCliOAuth } = await import("./oauth.js");
    await runRemoteLoginExpectingProjectId(loginGeminiCliOAuth, "daily-project");
    const loadRequests = requests.filter((request) =>
      request.url.includes("v1internal:loadCodeAssist"),
    );
    expect(loadRequests.map((request) => request.url)).toEqual([LOAD_PROD, LOAD_DAILY]);

    const firstHeaders = loadRequests[0]?.init?.headers;
    expect(getHeaderValue(firstHeaders, "X-Goog-Api-Client")).toBe(
      `gl-node/${process.versions.node}`,
    );

    const clientMetadata = getHeaderValue(firstHeaders, "Client-Metadata");
    expect(clientMetadata).toBeDefined();
    expect(JSON.parse(clientMetadata as string)).toEqual({
      ideType: "ANTIGRAVITY",
      platform: getExpectedPlatform(),
      pluginType: "GEMINI",
    });

    const body = JSON.parse(String(loadRequests[0]?.init?.body));
    expect(body).toEqual({
      metadata: {
        ideType: "ANTIGRAVITY",
        platform: getExpectedPlatform(),
        pluginType: "GEMINI",
      },
    });
  });

  it("falls back to GOOGLE_CLOUD_PROJECT when all loadCodeAssist endpoints fail", async () => {
    process.env.GOOGLE_CLOUD_PROJECT = "env-project";

    const requests: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = getRequestUrl(input);
      requests.push(url);

      if (url === TOKEN_URL) {
        return responseJson({
          access_token: "access-token",
          refresh_token: "refresh-token",
          expires_in: 3600,
        });
      }
      if (url === USERINFO_URL) {
        return responseJson({ email: "lobster@openclaw.ai" });
      }
      if ([LOAD_PROD, LOAD_DAILY, LOAD_AUTOPUSH].includes(url)) {
        return responseJson({ error: { message: "unavailable" } }, 503);
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { loginGeminiCliOAuth } = await import("./oauth.js");
    await runRemoteLoginExpectingProjectId(loginGeminiCliOAuth, "env-project");
    expect(requests.filter((url) => url.includes("v1internal:loadCodeAssist"))).toHaveLength(3);
    expect(requests.some((url) => url.includes("v1internal:onboardUser"))).toBe(false);
  });
});
