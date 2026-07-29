import { Cable } from "lucide-react";

import { AdminPlaceholder } from "@/components/shell/admin-placeholder";

export default function TimewebPage() {
  return (
    <AdminPlaceholder
      title="Подключение Timeweb"
      description="Production token не подключён; UI никогда не принимает и не показывает raw credential."
      icon={Cable}
    />
  );
}
