import type { NextConfig } from "next";
import { withWorkflow } from "@workflow/next";

import {
  API_CONTENT_SECURITY_POLICY,
  STATIC_SECURITY_HEADERS,
} from "./src/security-headers";

const nextConfig: NextConfig = {
  experimental: {
    authInterrupts: true,
  },
  async headers() {
    return [
      { source: "/:path*", headers: STATIC_SECURITY_HEADERS },
      // Политику документа выдаёт proxy: она содержит per-request nonce.
      // Здесь остаётся только API, который proxy намеренно не обрабатывает.
      {
        source: "/api/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: API_CONTENT_SECURITY_POLICY,
          },
        ],
      },
    ];
  },
};

export default withWorkflow(nextConfig);
