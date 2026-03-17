export const CHAT_ATTACHMENT_ACCEPT = "image/*,.docx,.doc,.txt,.md,.pdf";

export function isSupportedChatAttachmentMimeType(mimeType: string | null | undefined, fileName?: string): boolean {
  if (typeof mimeType !== "string") return false;
  
  // 支持图片
  if (mimeType.startsWith("image/")) return true;
  
  // 支持文档类型
  const supportedDocTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
    "application/msword", // .doc
    "text/plain", // .txt
    "text/markdown", // .md
    "application/pdf", // .pdf
  ];
  
  if (supportedDocTypes.includes(mimeType)) return true;
  
  // 通过文件扩展名判断（备用方案）
  if (fileName) {
    const supportedExtensions = [".docx", ".doc", ".txt", ".md", ".pdf"];
    const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));
    if (supportedExtensions.includes(ext)) return true;
  }
  
  return false;
}
