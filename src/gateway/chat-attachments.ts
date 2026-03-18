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
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/pdf",
    "text/plain",
    "text/markdown",
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
  return value.length > 0 && value.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function normalizeAttachment(
  att: ChatAttachment,
  idx: number,
  opts: { stripDataUrlPrefix: boolean; requireImageMime: boolean },
): NormalizedAttachment {
  const mime = att.mimeType ?? "";
  const content = att.content;
  // 优先使用 fileName，如果没有则使用默认值（不使用 type，因为 type 可能是 "image"）
  const label = att.fileName || `attachment-${idx + 1}`;

  if (typeof content !== "string") {
    throw new Error(`attachment ${label}: content must be base64 string`);
  }
  if (opts.requireImageMime && !mime.startsWith("image/")) {
    throw new Error(`attachment ${label}: only image/* supported`);
  }

  let base64 = content.trim();
  if (opts.stripDataUrlPrefix) {
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

  if (mimeType.includes("word") || fileName.endsWith(".docx") || fileName.endsWith(".doc")) {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      throw new Error(`Failed to parse DOCX: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (mimeType.includes("pdf") || fileName.endsWith(".pdf")) {
    return `[PDF document: ${fileName}]`;
  }

  if (mimeType.includes("text") || fileName.endsWith(".txt") || fileName.endsWith(".md")) {
    return buffer.toString("utf-8");
  }

  return `[Document: ${fileName}]`;
}

export async function parseMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number; log?: AttachmentLog },
): Promise<ParsedMessageWithImages> {
  const maxBytes = opts?.maxBytes ?? 5_000_000;
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
    // 调试日志：检查附件数据
    log?.info(`attachment ${idx}: fileName=${att.fileName}, type=${att.type}, mimeType=${att.mimeType}`);
    
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: true,
      requireImageMime: false,
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64: b64, label, mime } = normalized;

    const providedMime = normalizeMime(mime);
    const sniffedMime = normalizeMime(await sniffMimeFromBase64(b64));
    const fileName = att.fileName || label;
    log?.info(`attachment ${idx}: final fileName=${fileName}, label=${label}`);

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

    log?.warn(`attachment ${label}: unsupported mime type (${sniffedMime || providedMime || "unknown"}), skipping`);
  }

  let finalMessage = message;
  if (documents.length > 0) {
    // 为每个文档添加附件标识，让前端知道有文档附件
    const docHeaders = documents.map(doc => `**📄 已上传文件：${doc.fileName}**`).join("\n");
    
    const docContents = documents.map(doc => 
      `\n\n--- **${doc.fileName}** 内容如下 ---\n${doc.text}\n`
    ).join("\n");
    
    finalMessage = message.trim() 
      ? `${message}\n\n${docHeaders}${docContents}` 
      : `${docHeaders}${docContents}`;
  }

  return { message: finalMessage, images, documents };
}

export function buildMessageWithAttachments(
  message: string,
  attachments: ChatAttachment[] | undefined,
  opts?: { maxBytes?: number },
): string {
  const maxBytes = opts?.maxBytes ?? 2_000_000;
  if (!attachments || attachments.length === 0) {
    return message;
  }

  const blocks: string[] = [];

  for (const [idx, att] of attachments.entries()) {
    if (!att) {
      continue;
    }
    const normalized = normalizeAttachment(att, idx, {
      stripDataUrlPrefix: false,
      requireImageMime: true,
    });
    validateAttachmentBase64OrThrow(normalized, { maxBytes });
    const { base64, label, mime } = normalized;

    const safeLabel = label.replace(/\s+/g, "_");
    const dataUrl = `![${safeLabel}](data:${mime};base64,${base64})`;
    blocks.push(dataUrl);
  }

  if (blocks.length === 0) {
    return message;
  }
  const separator = message.trim().length > 0 ? "\n\n" : "";
  return `${message}${separator}${blocks.join("\n\n")}`;
}

export { ChatAttachment, ChatImageContent };
