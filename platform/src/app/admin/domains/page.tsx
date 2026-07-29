import { Globe2 } from "lucide-react";

import { AdminPlaceholder } from "@/components/shell/admin-placeholder";

export default function DomainsPage() {
  return (
    <AdminPlaceholder
      title="Домены и DNS"
      description="Здесь появятся безопасные DNS allocation и TLS status без raw provider payload."
      icon={Globe2}
    />
  );
}
