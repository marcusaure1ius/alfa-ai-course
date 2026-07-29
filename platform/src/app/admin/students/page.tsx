import { Users } from "lucide-react";

import { AdminPlaceholder } from "@/components/shell/admin-placeholder";

export default function StudentsPage() {
  return (
    <AdminPlaceholder
      title="Ученики"
      description="Управление доступом к основной среде будет добавлено после infrastructure foundation."
      icon={Users}
    />
  );
}
