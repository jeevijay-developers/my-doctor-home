# AI Blog Markdown Rendering Design

## Goal

Render AI-generated Markdown as formatted blog content in both the Admin editor and public blog pages, including content returned with structural markers collapsed onto one line.

## Confirmed behavior

- AI content with `#`-style headings, `**bold**`, ordered or unordered lists, blank-line paragraphs, and `---` rules renders as HTML.
- Collapsed AI output is normalized before parsing so headings and list items become separate blocks.
- Existing HTML content from manually written posts passes through unchanged.
- Raw Markdown saved by older AI posts is converted at public render time.
- Converted content is sanitized before being injected into the page.

## Architecture

Add a shared `markdownToHtml` utility. It will detect HTML, normalize Markdown block boundaries, parse Markdown using `marked`, and sanitize the result with the existing `DOMPurify` dependency. AI generation will convert content before placing it into TipTap, so the editor receives the HTML format it already produces. The public post page will use the same utility as a compatibility fallback for older raw Markdown rows.

The normalizer only inserts boundaries for recognizable Markdown constructs: heading markers at line starts or after sentence boundaries, ordered/bulleted list markers, and horizontal rules. It must not alter ordinary text containing `#`, `*`, or hyphens.

## Safety and compatibility

- `DOMPurify` remains the final sanitizer for both generated and stored content.
- Existing HTML is not parsed as Markdown, preventing manual rich text from changing appearance.
- AI output is treated as untrusted input; no raw model response is injected without sanitization.
- If parsing fails, the original text is escaped and displayed as readable paragraphs rather than crashing the editor/page.

## Testing

Tests cover headings, bold text, ordered and unordered lists, paragraphs, horizontal rules, collapsed one-line Markdown, HTML pass-through, and unsafe markup removal. BlogPage tests verify generated Markdown is converted before TipTap receives it; BlogPostPage tests verify stored Markdown is formatted publicly.

## Validation

- `npx vitest run src/lib/markdown.test.ts src/components/admin/BlogPage.test.tsx src/pages/BlogPostPage.test.tsx`
- `npx tsc --noEmit -p .`
- `npm run build`