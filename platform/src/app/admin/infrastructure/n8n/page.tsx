import { redirect } from "next/navigation";

export default function LegacyN8nSetupPage() {
  redirect("/admin/tools/n8n");
}
