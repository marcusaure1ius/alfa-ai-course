import { StudentToolCatalog } from "@/components/student/student-tool-catalog";
import { requirePageSession } from "@/server/auth/page-access";
import { getDatabase } from "@/server/db/client";
import { getStudentToolCatalog } from "@/server/tools/student-catalog";

export default async function StudentToolsPage() {
  const session = await requirePageSession();
  const tools = await getStudentToolCatalog(getDatabase(), session.userId);
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-muted-foreground">Инструменты</p>
        <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
          Учебные инструменты
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          Здесь собраны доступные учебные сервисы и их текущее состояние.
        </p>
        <StudentToolCatalog tools={tools} />
      </div>
    </div>
  );
}
