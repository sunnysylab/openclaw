import {
  describeImageWithModel,
  describeImagesWithModel,
  transcribeOpenAiCompatibleAudio,
  type AudioTranscriptionRequest,
  type MediaUnderstandingProvider,
} from "openclaw/plugin-sdk/media-understanding";
import { OPENAI_DEFAULT_AUDIO_TRANSCRIPTION_MODEL } from "./default-models.js";

export const DEFAULT_OPENAI_AUDIO_BASE_URL = "https://api.openai.com/v1";

function isOpenAIPublicApiBaseUrl(baseUrl: unknown): boolean {
  if (typeof baseUrl !== "string" || !baseUrl.trim()) {
    return false;
  }

  try {
    return new URL(baseUrl).hostname.toLowerCase() === "api.openai.com";
  } catch {
    return baseUrl.toLowerCase().includes("api.openai.com");
  }
}

export async function transcribeOpenAiAudio(params: AudioTranscriptionRequest) {
  const baseUrl = params.baseUrl?.trim() || DEFAULT_OPENAI_AUDIO_BASE_URL;
  return await transcribeOpenAiCompatibleAudio({
    ...params,
    provider: isOpenAIPublicApiBaseUrl(baseUrl) ? "openai" : undefined,
    defaultBaseUrl: DEFAULT_OPENAI_AUDIO_BASE_URL,
    defaultModel: OPENAI_DEFAULT_AUDIO_TRANSCRIPTION_MODEL,
  });
}

export const openaiMediaUnderstandingProvider: MediaUnderstandingProvider = {
  id: "openai",
  capabilities: ["image", "audio"],
  describeImage: describeImageWithModel,
  describeImages: describeImagesWithModel,
  transcribeAudio: transcribeOpenAiAudio,
};

export const openaiCodexMediaUnderstandingProvider: MediaUnderstandingProvider = {
  id: "openai-codex",
  capabilities: ["image"],
  describeImage: describeImageWithModel,
  describeImages: describeImagesWithModel,
};
