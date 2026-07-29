import { NextResponse, type NextRequest } from "next/server";

import { requireAdmin } from "@/server/auth/access";

export async function proxy(request: NextRequest): Promise<Response> {
  const access = await requireAdmin(request);
  return access.ok ? NextResponse.next() : access.response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
