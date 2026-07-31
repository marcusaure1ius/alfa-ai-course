import { redirect } from "next/navigation";

import { getPageSession } from "@/server/auth/page-access";

export default async function HomePage() {
  const session = await getPageSession();
  redirect(
    session?.role === "admin"
      ? "/admin/tools"
      : session?.role === "student"
        ? "/student"
        : "/login",
  );
}
