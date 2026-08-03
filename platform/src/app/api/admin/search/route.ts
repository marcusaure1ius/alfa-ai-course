import { requireAdmin } from "@/server/auth/access";
import { getAdminSearchResults } from "@/server/admin/search";
import { noStoreJson } from "@/server/course/http";
import { getDatabase } from "@/server/db/client";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const access = await requireAdmin(request);
  if (!access.ok) return access.response;

  const query = new URL(request.url).searchParams.get("q") ?? "";
  const search = await getAdminSearchResults(getDatabase(), query);
  return noStoreJson({ version: "admin-search-v1", ...search });
}
