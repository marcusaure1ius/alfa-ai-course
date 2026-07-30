import { describe, expect, it } from "vitest";

import {
  assertSafeCourseMarkdown,
  UnsafeCourseContentError,
} from "./content-safety";

describe("course Markdown boundary", () => {
  it("keeps the text-first Markdown used by Neurokurs", () => {
    expect(
      assertSafeCourseMarkdown(
        "# Сначала понять\n\n- Затем сделать\n\n[Документация](https://example.com)",
      ),
    ).toBe(
      "# Сначала понять\n\n- Затем сделать\n\n[Документация](https://example.com)",
    );
  });

  it.each([
    ["<script>alert(1)</script>", "RAW_HTML"],
    ["[опасная ссылка](javascript:alert(1))", "DANGEROUS_URL"],
    ["![tracking](https://attacker.invalid/pixel)", "EMBEDDED_CONTENT"],
  ] as const)("rejects unsupported input %s", (source, code) => {
    expect(() => assertSafeCourseMarkdown(source)).toThrowError(
      expect.objectContaining<Partial<UnsafeCourseContentError>>({ code }),
    );
  });
});
