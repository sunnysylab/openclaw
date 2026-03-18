import { GEMINI_CLI_CLIENT_ID, GEMINI_CLI_CLIENT_SECRET } from "./constants.js";
import { CLIENT_ID_KEYS, CLIENT_SECRET_KEYS } from "./oauth.shared.js";

function resolveEnv(keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

export function clearCredentialsCache(): void {}

export function extractGeminiCliCredentials(): { clientId: string; clientSecret: string } {
  return {
    clientId: GEMINI_CLI_CLIENT_ID,
    clientSecret: GEMINI_CLI_CLIENT_SECRET,
  };
}

export function resolveOAuthClientConfig(): { clientId: string; clientSecret?: string } {
  const envClientId = resolveEnv(CLIENT_ID_KEYS);
  const envClientSecret = resolveEnv(CLIENT_SECRET_KEYS);
  if (envClientId) {
    return { clientId: envClientId, clientSecret: envClientSecret };
  }

  const extracted = extractGeminiCliCredentials();
  if (extracted) {
    return extracted;
  }

  throw new Error(
    "Gemini CLI not found. Install it first: brew install gemini-cli (or npm install -g @google/gemini-cli), or set GEMINI_CLI_OAUTH_CLIENT_ID.",
  );
}
