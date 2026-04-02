import {
  createAuthCaptureJsonFetch,
  createRequestCaptureJsonFetch,
  installPinnedHostnameTestHooks,
} from "openclaw/plugin-sdk/testing";
import { describe, expect, it } from "vitest";
import { transcribeOpenAiAudio } from "./media-understanding-provider.js";

installPinnedHostnameTestHooks();

describe("transcribeOpenAiAudio", () => {
  it("respects lowercase authorization header overrides", async () => {
    const { fetchFn, getAuthHeader } = createAuthCaptureJsonFetch({ text: "ok" });

    const result = await transcribeOpenAiAudio({
      buffer: Buffer.from("audio"),
      fileName: "note.mp3",
      apiKey: "test-key",
      timeoutMs: 1000,
      headers: { authorization: "Bearer override" },
      fetchFn,
    });

    expect(getAuthHeader()).toBe("Bearer override");
    expect(result.text).toBe("ok");
  });

  it("builds the expected request payload", async () => {
    const { fetchFn, getRequest } = createRequestCaptureJsonFetch({ text: "hello" });

    const result = await transcribeOpenAiAudio({
      buffer: Buffer.from("audio-bytes"),
      fileName: "voice.wav",
      apiKey: "test-key",
      timeoutMs: 1234,
      baseUrl: "https://api.example.com/v1/",
      model: " ",
      language: " en ",
      prompt: " hello ",
      mime: "audio/wav",
      headers: { "X-Custom": "1" },
      fetchFn,
    });
    const { url: seenUrl, init: seenInit } = getRequest();

    expect(result.model).toBe("gpt-4o-mini-transcribe");
    expect(result.text).toBe("hello");
    expect(seenUrl).toBe("https://api.example.com/v1/audio/transcriptions");
    expect(seenInit?.method).toBe("POST");
    expect(seenInit?.signal).toBeInstanceOf(AbortSignal);

    const headers = new Headers(seenInit?.headers);
    expect(headers.get("authorization")).toBe("Bearer test-key");
    expect(headers.get("x-custom")).toBe("1");
    expect(headers.get("originator")).toBeNull();
    expect(headers.get("user-agent")).toBeNull();

    const form = seenInit?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("model")).toBe("gpt-4o-mini-transcribe");
    expect(form.get("language")).toBe("en");
    expect(form.get("prompt")).toBe("hello");
    const file = form.get("file") as Blob | { type?: string; name?: string } | null;
    expect(file).not.toBeNull();
    if (file) {
      expect(file.type).toBe("audio/wav");
      if ("name" in file && typeof file.name === "string") {
        expect(file.name).toBe("voice.wav");
      }
    }
  });

  it("throws when the provider response omits text", async () => {
    const { fetchFn } = createRequestCaptureJsonFetch({});

    await expect(
      transcribeOpenAiAudio({
        buffer: Buffer.from("audio-bytes"),
        fileName: "voice.wav",
        apiKey: "test-key",
        timeoutMs: 1234,
        fetchFn,
      }),
    ).rejects.toThrow("Audio transcription response missing text");
  });

  it("adds attribution only for official OpenAI hosts", async () => {
    process.env.OPENCLAW_VERSION = "2026.4.2";
    const official = createRequestCaptureJsonFetch({ text: "ok" });

    await transcribeOpenAiAudio({
      buffer: Buffer.from("audio"),
      fileName: "voice.wav",
      apiKey: "test-key",
      timeoutMs: 1000,
      fetchFn: official.fetchFn,
    });

    const officialHeaders = new Headers(official.getRequest().init?.headers);
    expect(officialHeaders.get("originator")).toBe("openclaw");
    expect(officialHeaders.get("user-agent")).toBe("openclaw/2026.4.2");

    const proxy = createRequestCaptureJsonFetch({ text: "ok" });

    await transcribeOpenAiAudio({
      buffer: Buffer.from("audio"),
      fileName: "voice.wav",
      apiKey: "test-key",
      timeoutMs: 1000,
      baseUrl: "https://proxy.example.com/v1",
      fetchFn: proxy.fetchFn,
    });

    const proxyHeaders = new Headers(proxy.getRequest().init?.headers);
    expect(proxyHeaders.get("originator")).toBeNull();
    expect(proxyHeaders.get("user-agent")).toBeNull();
  });
});
