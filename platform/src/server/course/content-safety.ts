const RAW_HTML = /</;
const DANGEROUS_PROTOCOL = /(?:javascript|vbscript|data)\s*:/i;
const EMBEDDED_CONTENT = /!\[[^\]]*\]\([^)]*\)/;

export class UnsafeCourseContentError extends Error {
  constructor(public readonly code: "RAW_HTML" | "DANGEROUS_URL" | "EMBEDDED_CONTENT") {
    super(code);
  }
}

/**
 * Course materials use a deliberately small text-first Markdown subset.
 * Raw HTML and embedded media are rejected at the write boundary, so the
 * student UI can render parsed text nodes without dangerouslySetInnerHTML.
 */
export function assertSafeCourseMarkdown(source: string): string {
  if (RAW_HTML.test(source)) {
    throw new UnsafeCourseContentError("RAW_HTML");
  }
  if (DANGEROUS_PROTOCOL.test(source)) {
    throw new UnsafeCourseContentError("DANGEROUS_URL");
  }
  if (EMBEDDED_CONTENT.test(source)) {
    throw new UnsafeCourseContentError("EMBEDDED_CONTENT");
  }
  return source.replace(/\r\n?/g, "\n").trim();
}
