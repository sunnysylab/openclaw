import { normalizeResolvedSecretInputString } from "openclaw/plugin-sdk/secret-input";
import type {
  SpeechProviderConfig,
  SpeechProviderPlugin,
  SpeechVoiceOption,
} from "openclaw/plugin-sdk/speech-core";

const DEFAULT_INWORLD_BASE_URL = "https://api.inworld.ai";
const DEFAULT_INWORLD_VOICE_ID = "Dennis";
const DEFAULT_INWORLD_MODEL_ID = "inworld-tts-1.5-max";

const INWORLD_TTS_MODELS = [
  "inworld-tts-1.5-max",
  "inworld-tts-1.5-mini",
  "inworld-tts-1-max",
  "inworld-tts-1",
] as const;

type InworldAudioEncoding = "MP3" | "OGG_OPUS" | "LINEAR16" | "PCM" | "WAV" | "ALAW" | "MULAW" | "FLAC";

type InworldProviderConfig = {
  apiKey?: string;
  baseUrl: string;
  voiceId: string;
  modelId: string;
  temperature?: number;
};

function trimToUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function normalizeInworldBaseUrl(baseUrl: string | undefined): string {
  const trimmed = baseUrl?.trim();
  return trimmed?.replace(/\/+$/, "") || DEFAULT_INWORLD_BASE_URL;
}

function normalizeInworldProviderConfig(rawConfig: Record<string, unknown>): InworldProviderConfig {
  const providers = asObject(rawConfig.providers);
  const raw = asObject(providers?.inworld) ?? asObject(rawConfig.inworld);
  return {
    apiKey: normalizeResolvedSecretInputString({
      value: raw?.apiKey,
      path: "messages.tts.providers.inworld.apiKey",
    }),
    baseUrl: normalizeInworldBaseUrl(trimToUndefined(raw?.baseUrl)),
    voiceId: trimToUndefined(raw?.voiceId) ?? DEFAULT_INWORLD_VOICE_ID,
    modelId: trimToUndefined(raw?.modelId) ?? DEFAULT_INWORLD_MODEL_ID,
    temperature: asNumber(raw?.temperature),
  };
}

function readInworldProviderConfig(config: SpeechProviderConfig): InworldProviderConfig {
  const defaults = normalizeInworldProviderConfig({});
  return {
    apiKey: trimToUndefined(config.apiKey) ?? defaults.apiKey,
    baseUrl: normalizeInworldBaseUrl(trimToUndefined(config.baseUrl) ?? defaults.baseUrl),
    voiceId: trimToUndefined(config.voiceId) ?? defaults.voiceId,
    modelId: trimToUndefined(config.modelId) ?? defaults.modelId,
    temperature: asNumber(config.temperature) ?? defaults.temperature,
  };
}

/**
 * Calls the Inworld streaming TTS endpoint and collects all audio chunks
 * into a single buffer. The stream returns newline-delimited JSON objects,
 * each containing base64-encoded audio in `result.audioContent`.
 */
export async function inworldTTS(params: {
  text: string;
  apiKey: string;
  baseUrl?: string;
  voiceId?: string;
  modelId?: string;
  audioEncoding?: InworldAudioEncoding;
  sampleRateHertz?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<Buffer> {
  const baseUrl = normalizeInworldBaseUrl(params.baseUrl);

  const controller = new AbortController();
  const timeout = params.timeoutMs
    ? setTimeout(() => controller.abort(), params.timeoutMs)
    : undefined;

  try {
    const res = await fetch(`${baseUrl}/tts/v1/voice:stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${params.apiKey}`,
      },
      body: JSON.stringify({
        text: params.text,
        voiceId: params.voiceId ?? DEFAULT_INWORLD_VOICE_ID,
        modelId: params.modelId ?? DEFAULT_INWORLD_MODEL_ID,
        audioConfig: {
          audioEncoding: params.audioEncoding ?? "MP3",
          ...(params.sampleRateHertz && { sampleRateHertz: params.sampleRateHertz }),
        },
        ...(params.temperature != null && { temperature: params.temperature }),
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => "");
      throw new Error(`Inworld TTS API error (${res.status}): ${errorBody}`);
    }

    // The streaming endpoint returns newline-delimited JSON objects.
    // Each object has { result: { audioContent: "<base64>" } }.
    const body = await res.text();
    const chunks: Buffer[] = [];

    for (const line of body.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      let parsed: { result?: { audioContent?: string }; error?: { code?: number; message?: string } };
      try {
        parsed = JSON.parse(trimmed) as typeof parsed;
      } catch {
        throw new Error(
          `Inworld TTS stream parse error: unexpected non-JSON line: ${trimmed.slice(0, 80)}`,
        );
      }

      if (parsed.error) {
        throw new Error(`Inworld TTS stream error (${parsed.error.code}): ${parsed.error.message}`);
      }

      if (parsed.result?.audioContent) {
        chunks.push(Buffer.from(parsed.result.audioContent, "base64"));
      }
    }

    if (chunks.length === 0) {
      throw new Error("Inworld TTS returned no audio data");
    }

    return Buffer.concat(chunks);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export async function listInworldVoices(params: {
  apiKey: string;
  baseUrl?: string;
  language?: string;
  timeoutMs?: number;
}): Promise<SpeechVoiceOption[]> {
  const baseUrl = normalizeInworldBaseUrl(params.baseUrl);
  const langParam = params.language ? `?languages=${encodeURIComponent(params.language)}` : "";

  // Uses the Voices API (replaces deprecated /tts/v1/voices, removed July 2026).
  const res = await fetch(`${baseUrl}/voices/v1/voices${langParam}`, {
    headers: {
      Authorization: `Basic ${params.apiKey}`,
    },
    ...(params.timeoutMs && { signal: AbortSignal.timeout(params.timeoutMs) }),
  });

  if (!res.ok) {
    const errorBody = await res.text().catch(() => "");
    throw new Error(`Inworld voices API error (${res.status}): ${errorBody}`);
  }

  const json = (await res.json()) as {
    voices?: Array<{
      voiceId?: string;
      displayName?: string;
      description?: string;
      langCode?: string;
      tags?: string[];
      source?: string;
    }>;
  };

  return Array.isArray(json.voices)
    ? json.voices
        .map((voice) => ({
          id: voice.voiceId?.trim() ?? "",
          name: voice.displayName?.trim() || undefined,
          description: voice.description?.trim() || undefined,
          locale: voice.langCode || undefined,
          gender: voice.tags?.find((t) => t === "male" || t === "female") || undefined,
        }))
        .filter((voice) => voice.id.length > 0)
    : [];
}

export function buildInworldSpeechProvider(): SpeechProviderPlugin {
  return {
    id: "inworld",
    label: "Inworld",
    autoSelectOrder: 30,
    models: INWORLD_TTS_MODELS,
    resolveConfig: ({ rawConfig }) => normalizeInworldProviderConfig(rawConfig),
    isConfigured: ({ providerConfig }) =>
      Boolean(readInworldProviderConfig(providerConfig).apiKey || process.env.INWORLD_API_KEY),
    listVoices: async (req) => {
      const config = req.providerConfig
        ? readInworldProviderConfig(req.providerConfig)
        : undefined;
      const apiKey = req.apiKey || config?.apiKey || process.env.INWORLD_API_KEY;
      if (!apiKey) {
        throw new Error("Inworld API key missing");
      }
      return listInworldVoices({
        apiKey,
        baseUrl: req.baseUrl ?? config?.baseUrl,
      });
    },
    synthesize: async (req) => {
      const config = readInworldProviderConfig(req.providerConfig);
      const overrides = req.providerOverrides ?? {};
      const apiKey = config.apiKey || process.env.INWORLD_API_KEY;
      if (!apiKey) {
        throw new Error("Inworld API key missing");
      }

      const useOpus = req.target === "voice-note";
      const audioEncoding: InworldAudioEncoding = useOpus ? "OGG_OPUS" : "MP3";

      const audioBuffer = await inworldTTS({
        text: req.text,
        apiKey,
        baseUrl: config.baseUrl,
        voiceId: trimToUndefined(overrides.voiceId) ?? config.voiceId,
        modelId: trimToUndefined(overrides.modelId) ?? config.modelId,
        audioEncoding,
        temperature: asNumber(overrides.temperature) ?? config.temperature,
        timeoutMs: req.timeoutMs,
      });

      return {
        audioBuffer,
        outputFormat: audioEncoding.toLowerCase(),
        fileExtension: useOpus ? ".ogg" : ".mp3",
        voiceCompatible: useOpus,
      };
    },
    synthesizeTelephony: async (req) => {
      const config = readInworldProviderConfig(req.providerConfig);
      const apiKey = config.apiKey || process.env.INWORLD_API_KEY;
      if (!apiKey) {
        throw new Error("Inworld API key missing");
      }

      const sampleRate = 22050;
      const audioBuffer = await inworldTTS({
        text: req.text,
        apiKey,
        baseUrl: config.baseUrl,
        voiceId: config.voiceId,
        modelId: config.modelId,
        audioEncoding: "PCM",
        sampleRateHertz: sampleRate,
        temperature: config.temperature,
        timeoutMs: req.timeoutMs,
      });

      return { audioBuffer, outputFormat: "pcm", sampleRate };
    },
  };
}
