import { ScrollText } from "lucide-react";

import { AdminPlaceholder } from "@/components/shell/admin-placeholder";

export default function AuditPage() {
  return (
    <AdminPlaceholder
      title="Аудит"
      description="Append-only auth и infrastructure events будут показаны только администраторам."
      icon={ScrollText}
    />
  );
}
