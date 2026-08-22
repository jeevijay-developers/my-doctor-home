import DOMPurify from "dompurify";
import { marked } from "marked";

const hasHtmlTags = (content: string) => /<\/?[a-z][\s\S]*>/i.test(content);

const normalizeMarkdownBlocks = (content: string) => content
  .replace(/([^#\n])(#{2,4})(?=\s)/g, "$1\n\n$2")
  .replace(/([^\n])(?:\s*)(\d+\.\s+)(?=[^\n]*(?:\d+\.\s+|[-*]\s+|---(?:\s|$)))/g, "$1\n$2")
  .replace(/([^\n])(?:\s*)([-*])(\s+)(?=[^\n]*(?:\2\s+|---(?:\s|$)))/g, "$1\n$2$3")
  .replace(/([^\n])(?:\s*)---(?=\s|$)/g, "$1\n\n---");

export const markdownToHtml = (content: string | null | undefined): string => {
  if (!content) return "";
  if (hasHtmlTags(content)) return DOMPurify.sanitize(content);

  const normalized = normalizeMarkdownBlocks(content);
  return DOMPurify.sanitize(marked.parse(normalized) as string);
};