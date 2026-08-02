import type { ReactNode } from "react";

import type { TocItem } from "@/components/student/material-toc";

type MarkdownBlock =
  | { kind: "heading"; level: 2 | 3; id: string; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; language: string | null; text: string }
  | { kind: "table"; headers: string[]; rows: string[][] };

export const COURSE_MARKDOWN_SUBSET = [
  "headings-h1-h3",
  "paragraphs",
  "bold",
  "inline-code",
  "safe-links",
  "quotes",
  "ordered-and-unordered-lists",
  "fenced-code-with-optional-language",
  "pipe-tables",
] as const;

const FENCE = /^```([\p{L}\p{N}_+-]+)?\s*$/u;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/;

function tableCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function headingId(
  text: string,
  index: number,
  usedIds: Set<string>,
): string {
  const value = text
    .toLocaleLowerCase("ru")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  const base = value || `section-${index + 1}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

export function parseCourseMarkdown(source: string): {
  blocks: MarkdownBlock[];
  toc: TocItem[];
} {
  const lines = source.split("\n");
  const blocks: MarkdownBlock[] = [];
  const usedHeadingIds = new Set<string>();
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const fence = FENCE.exec(line.trim());
    if (fence) {
      const code: string[] = [];
      const language = fence[1]?.toLocaleLowerCase("en") ?? null;
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index]?.trim() ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      if (/^```\s*$/.test(lines[index]?.trim() ?? "")) index += 1;
      blocks.push({ kind: "code", language, text: code.join("\n") });
      continue;
    }
    if (
      line.includes("|") &&
      index + 1 < lines.length &&
      TABLE_DIVIDER.test(lines[index + 1] ?? "")
    ) {
      const headers = tableCells(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length && (lines[index] ?? "").includes("|")) {
        const cells = tableCells(lines[index] ?? "");
        rows.push(headers.map((_, cellIndex) => cells[cellIndex] ?? ""));
        index += 1;
      }
      blocks.push({ kind: "table", headers, rows });
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      const text = heading[2]?.trim() ?? "";
      const level = Math.max(2, heading[1]?.length ?? 2) as 2 | 3;
      blocks.push({
        kind: "heading",
        level,
        text,
        id: headingId(text, blocks.length, usedHeadingIds),
      });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      blocks.push({ kind: "quote", text: line.replace(/^>\s?/, "").trim() });
      index += 1;
      continue;
    }
    const unordered = /^[-*]\s+(.+)$/.exec(line);
    const ordered = /^\d+\.\s+(.+)$/.exec(line);
    if (unordered || ordered) {
      const isOrdered = Boolean(ordered);
      const items: string[] = [];
      while (index < lines.length) {
        const match = isOrdered
          ? /^\d+\.\s+(.+)$/.exec(lines[index] ?? "")
          : /^[-*]\s+(.+)$/.exec(lines[index] ?? "");
        if (!match) break;
        items.push(match[1]?.trim() ?? "");
        index += 1;
      }
      blocks.push({ kind: "list", ordered: isOrdered, items });
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      lines[index]?.trim() &&
      !/^(#{1,3})\s+|^>\s?|^[-*]\s+|^\d+\.\s+|^```/.test(lines[index] ?? "") &&
      !(
        (lines[index] ?? "").includes("|") &&
        TABLE_DIVIDER.test(lines[index + 1] ?? "")
      )
    ) {
      paragraph.push(lines[index]?.trim() ?? "");
      index += 1;
    }
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }
  return {
    blocks,
    toc: blocks
      .filter(
        (block): block is Extract<MarkdownBlock, { kind: "heading" }> =>
          block.kind === "heading",
      )
      .map((block) => ({ id: block.id, label: block.text, level: block.level })),
  };
}

export function hasCourseMarkdownContent(source: string): boolean {
  return parseCourseMarkdown(source).blocks.length > 0;
}

function safeHref(value: string): string | null {
  if (value.startsWith("//")) return null;
  if (value.startsWith("/") || value.startsWith("#")) return value;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    return url.protocol === "https:" || url.protocol === "http:" ? value : null;
  } catch {
    return null;
  }
}

function inline(text: string): ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(text.slice(cursor, start));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`${start}-strong`}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(
        <code
          key={`${start}-code`}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link?.[2] ? safeHref(link[2]) : null;
      nodes.push(
        href ? (
          <a
            key={`${start}-link`}
            href={href}
            className="font-medium underline decoration-border underline-offset-4 hover:decoration-foreground"
            rel={href.startsWith("http") ? "noreferrer" : undefined}
            target={href.startsWith("http") ? "_blank" : undefined}
          >
            {link?.[1]}
          </a>
        ) : (
          token
        ),
      );
    }
    cursor = start + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function SafeMarkdown({ source }: { source: string }) {
  const { blocks } = parseCourseMarkdown(source);
  if (blocks.length === 0) {
    return (
      <div className="student-prose" role="status">
        <p>
          Содержимое материала готовится. Оно появится здесь после публикации.
        </p>
      </div>
    );
  }
  return (
    <div className="student-prose">
      {blocks.map((block, index) => {
        if (block.kind === "heading") {
          return block.level === 2 ? (
            <h2
              id={block.id}
              key={`${block.id}-${index}`}
              tabIndex={-1}
              data-reading-anchor
            >
              {inline(block.text)}
            </h2>
          ) : (
            <h3
              id={block.id}
              key={`${block.id}-${index}`}
              tabIndex={-1}
              data-reading-anchor
            >
              {inline(block.text)}
            </h3>
          );
        }
        if (block.kind === "paragraph") {
          return <p key={index}>{inline(block.text)}</p>;
        }
        if (block.kind === "quote") {
          return <blockquote key={index}>{inline(block.text)}</blockquote>;
        }
        if (block.kind === "code") {
          return (
            <pre key={index} data-language={block.language ?? undefined}>
              <code
                className={block.language ? `language-${block.language}` : undefined}
              >
                {block.text}
              </code>
            </pre>
          );
        }
        if (block.kind === "table") {
          return (
            <div
              key={index}
              className="student-table-scroll"
              role="region"
              aria-label="Таблица материала"
              tabIndex={0}
            >
              <table>
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th scope="col" key={headerIndex}>
                        {inline(header)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {row.map((cell, cellIndex) => (
                        <td key={cellIndex}>{inline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const List = block.ordered ? "ol" : "ul";
        return (
          <List key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{inline(item)}</li>
            ))}
          </List>
        );
      })}
    </div>
  );
}
