import type { NextConfig } from "next";
import { withWorkflow } from "@workflow/next";

import { buildSecurityHeaderRules } from "./src/security-headers";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  // Политику документа выдаёт proxy: она содержит per-request nonce. Здесь
  // остаются заголовки, не зависящие от запроса, и политика для API.
  async headers() {
    return buildSecurityHeaderRules();
  },
};

export default withWorkflow(nextConfig);
