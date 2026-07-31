import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const fontAssets = {
  "public/fonts/alfa-interface-sans/alfa-interface-sans_regular.woff2":
    "d01f0c2f390e7c373693660a0170189420fc0afe622ef55e3322e570c13e3a3b",
  "public/fonts/alfa-interface-sans/alfa-interface-sans_medium.woff2":
    "755be234d337016be4e3e82496fbd27c1618841ede2ba73eeda7bf2abd8f9eab",
  "public/fonts/alfa-interface-sans/alfa-interface-sans_bold.woff2":
    "266ba91e69dc335f050ab70561fc579c98d61a6ea52796148931d4f4eb11aa4c",
  "public/fonts/styrene/Styrene-A-LC-Medium.woff":
    "be58c990671fd4136f64cbea3bbbbff4904a0e1e263907615ee0407f0e60435c",
  "public/fonts/styrene/Styrene-A-LC-Black.woff":
    "48dde634ec946cab481c5ebc4952a541a4b688b610314ada12cac8f42258841d",
} as const;

describe("self-hosted typography assets", () => {
  for (const [path, expectedSha256] of Object.entries(fontAssets)) {
    it(`keeps ${path} byte-identical to the approved source`, () => {
      const file = readFileSync(resolve(process.cwd(), path));
      const sha256 = createHash("sha256").update(file).digest("hex");

      expect(sha256).toBe(expectedSha256);
    });
  }
});
