import { Settings2 } from "lucide-react";

import { AdminPlaceholder } from "@/components/shell/admin-placeholder";

export default function SettingsPage() {
  return (
    <AdminPlaceholder
      title="Настройки"
      description="Параметры guardrails и профилей появятся без возможности передать произвольный shell script."
      icon={Settings2}
    />
  );
}
