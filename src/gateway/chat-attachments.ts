import { estimateBase64DecodedBytes } from "../media/base64.js";
import { sniffMimeFromBase64 } from "../media/sniff-mime-from-base64.js";
import mammoth from "mammoth";

export type ChatAttachment = {
  type?: string;
  mimeType?: string;
  fileName?: string;
  content?: unknown;
};

export type ChatImageContent = {
  type: "image";
  data: string;
  mimeType: string;
};

export type ChatDocumentContent = {
  type: "document";
  fileName: string;
  mimeType: string;
  text: string;
};

export type ParsedMessageWithAttachments = {
  message: string;
  images: ChatImageContent[];
  documents: ChatDocumentContent[];
};

type AttachmentLog = {
  warn: (message: string) => void;
  info: (message: string) => void;
};

type NormalizedAttachment = {
  label: string;
  mime: string;
  base64: string;
};

function normalizeMime(mime?: string): string | undefined {
  if (!mime) {
    return undefined;
  }
  const cleaned = mime.split(";")[0]?.trim().toLowerCase();
  return cleaned || undefined;
}

function isImageMime(mime?: string): boolean {
  return typeof mime === "string" && mime.startsWith("image/");
}

function isDocumentMime(mime?: string): boolean {
  if (!mime) return false;
  const documentMimes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc
    "application/pdf", // .pdf
    "text/plain", // .txt
    "text/markdown", // .md
    "application/markdown",
  ];
  return documentMimes.includes(mime);
}

function isDocumentFileName(fileName?: string): boolean {
  if (!fileName) return false;
  const documentExtensions = [".docx", ".doc", ".pdf", ".txt", ".md", ".markdown"];
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
  return documentExtensions.includes(ext);
}

function isValidBase64(value: string): boolean {
  // Minimal validation; avoid full decode allocations for large payloads.
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function normalizeAttachment(
  att: ChatAttachment,
  idx: number,
  opts: { stripDataUrlPrefix: boolean; requireImageMime: boolean },
): NormalizedAttachment {
  const mime = att.mimeType ?? "";
  const content = att.content;
  const label = att.fileName || att.type || `attachment-${idx + 1}`;

  if (typeof content !== "string") {
    throw new Error(`attachment ${label}: content must be base64 string`);
  }
  if (opts.requireImageMime && !mime.startsWith("image/")) {
    throw new Error(`attachment ${label}: only image/* supported`);
  }

  let base64 = content.trim();
  if (opts.stripDataUrlPrefix) {
    // Strip data URL prefix if present (e.g., "data:image/jpeg;base64,...").
    const dataUrlMatch = /^data:[^;]+;base64,(.*)$/.exec(base64);
    if (dataUrlMatch) {
      base64 = dataUrlMatch[1];
    }
  }
  return { label, mime, base64 };
}

function validateAttachmentBase64OrThrow(
  normalized: NormalizedAttachment,
  opts: { maxBytes: number },
): number {
  if (!isValidBase64(normalized.base64)) {
    throw new Error(`attachment ${normalized.label}: invalid base64 content`);
  }
  const sizeBytes = estimateBase64DecodedBytes(normalized.base64);
  if (sizeBytes <= 0 || sizeBytes > opts.maxBytes) {
    throw new Error(
      `attachment ${normalized.label}: exceeds size limit (${sizeBytes} > ${opts.maxBytes} bytes)`,
    );
  }
  return sizeBytes;
}

async function parseDocumentContent(
  base64: string,
  mimeType: string,
  fileName: string,
): Promise<string> {
  const buffer = Buffer.from(base64, "base64");

  // DOCX
  if (mimeType.includes("word") || fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // PDF - return placeholder, actual parsing would need pdfjs-dist
  if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
    return `[PDF document: ${fileName}]`;
  }

  // Plain text
  if (mimeType.includes("text") || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return buffer.toString("utf-8");
  }

  return `[Document: ${fileName}]`;
}

/**
 * Parse attachments and extract images and documents as structured content blocks.
 * Returns the message text and arrays of image and document content blocks.
 */
export async function parseMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number; log?: AttachmentLog },
): Promise<ParsedMessageWithAttachments> {
  const maxBytes = opts?.maxBytes ?? 5_000_000; // decoded bytes (5,000,000)
  const log = opts?.log;
  if (!attachments || attachments.length === 0) {
    return { message, images: [], documents: [] };
  }

  const images: ChatImageContent[] = [];
  const documents: ChatDocumentContent[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: true,
      requireImageMime: false,
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64: b64, label, mime } = normalized;

    const providedMime = normalizeMime(mime);
    const sniffedMime = normalizeMime(await sniffMimeFromBase64(b64));
    const fileName = att.fileName || label;

    // Check if it's an image
    if (isImageMime(sniffedMime) || isImageMime(providedMime)) {
      if (sniffedMime && providedMime && sniffedMime !== providedMime) {
        log?.warn(
          `attachment ${label}: mime mismatch (${providedMime} -> ${sniffedMime}), using sniffed`,
        );
      }
      images.push({
        type: "image",
        data: b64,
        mimeType: sniffedMime ?? providedMime ?? mime,
      });
      continue;
    }

    // Check if it's a document
    if (isDocumentMime(sniffedMime) || isDocumentMime(providedMime) || isDocumentFileName(fileName)) {
      log?.info(`attachment ${label}: detected document, parsing content...`);
      try {
        const text = await parseDocumentContent(b64, providedMime || sniffedMime || "", fileName);
        documents.push({
          type: "document",
          fileName,
          mimeType: providedMime || sniffedMime || mime,
          text,
        });
      } catch (error) {
        log?.warn(`attachment ${label}: failed to parse document - ${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }

    // Unknown type
    log?.warn(`attachment ${label}: unsupported mime type (${sniffedMime || providedMime || "unknown"}), skipping`);
  }

  // Append document contents to message
  let finalMessage = message;
  if (documents.length > 0) {
    const docContents = documents.map(doc => 
      `--- ${doc.fileName} ---\n${doc.text}\n`
    ).join("\n");
    finalMessage = message.trim() ? `${message}\n\n${docContents}` : docContents;
  }

  return { message: finalMessage, images, documents };
}

/**
 * @deprecated Use parseMessageWithAttachments instead.
 * This function converts images to markdown data URLs which Claude API cannot process as images.
 */
export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number },
): string {
  const maxBytes = opts?.maxBytes ?? 2_000_000; // 2 MB
  if (!attachments || attachments.length === 0) {
    return message;
  }

  const blocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const normalized = normalizeAttachment(att, idx, {
