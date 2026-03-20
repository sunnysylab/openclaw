import { describe, expect, it } from "vitest";
import { TtsConfigSchema } from "./zod-schema.core.js";

describe("TtsConfigSchema openai speed and instructions", () => {
  it("accepts speed and instructions in openai section", () => {
    expect(() =>
      TtsConfigSchema.parse({
        openai: {
          voice: "alloy",
          speed: 1.5,
          instructions: "Speak in a cheerful tone",
        },
      }),
    ).not.toThrow();
  });

  it("rejects out-of-range openai speed", () => {
    expect(() =>
      TtsConfigSchema.parse({
        openai: {
          speed: 5.0,
        },
      }),
    ).toThrow();
  });

  it("rejects openai speed below minimum", () => {
    expect(() =>
      TtsConfigSchema.parse({
        openai: {
          speed: 0.1,
        },
      }),
    ).toThrow();
  });
});

describe("TtsConfigSchema xai", () => {
  it("accepts xai section with all fields", () => {
    expect(() =>
      TtsConfigSchema.parse({
        xai: {
          voice: "alloy",
          speed: 1.5,
          baseUrl: "https://api.x.ai/v1",
          model: "gpt-4o-mini-tts",
          language: "en",
          outputFormat: "mp3",
          sampleRate: 24000,
        },
      }),
    ).not.toThrow();
  });

  it("accepts xai section with only voice", () => {
    expect(() =>
      TtsConfigSchema.parse({
        xai: {
          voice: "zephyr",
        },
      }),
    ).not.toThrow();
  });

  it("rejects out-of-range xai speed", () => {
    expect(() =>
      TtsConfigSchema.parse({
        xai: {
          speed: 5.0,
        },
      }),
    ).toThrow();
  });

  it("rejects xai speed below minimum", () => {
    expect(() =>
      TtsConfigSchema.parse({
        xai: {
          speed: 0.1,
        },
      }),
    ).toThrow();
  });

  it("accepts valid xai outputFormat values", () => {
    for (const fmt of ["mp3", "wav", "pcm", "g711_alaw", "g711_ulaw"] as const) {
      expect(() => TtsConfigSchema.parse({ xai: { outputFormat: fmt } })).not.toThrow();
    }
  });

  it("rejects invalid xai outputFormat", () => {
    expect(() => TtsConfigSchema.parse({ xai: { outputFormat: "flac" } })).toThrow();
  });

  it("accepts valid xai sampleRate values", () => {
    for (const sr of [8000, 16000, 24000, 48000]) {
      expect(() => TtsConfigSchema.parse({ xai: { sampleRate: sr } })).not.toThrow();
    }
  });

  it("rejects out-of-range xai sampleRate", () => {
    expect(() => TtsConfigSchema.parse({ xai: { sampleRate: 6000 } })).toThrow();
    expect(() => TtsConfigSchema.parse({ xai: { sampleRate: 96000 } })).toThrow();
  });
});
