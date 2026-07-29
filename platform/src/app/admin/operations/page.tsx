import { History } from "lucide-react";

import { AdminPlaceholder } from "@/components/shell/admin-placeholder";

export default function OperationsPage() {
  return (
    <AdminPlaceholder
      title="Операции"
      description="Полная визуализация durable timeline будет реализована отдельной задачей."
      icon={History}
    />
  );
}
