import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { StudentN8nAccessCard } from "@/components/student/student-n8n-access";
import { requirePageSession } from "@/server/auth/page-access";
import { getDatabase } from "@/server/db/client";
import { getStudentN8nAccess } from "@/server/tools/student-access";

export default async function StudentN8nPage() {
  const session = await requirePageSession();
  const access = await getStudentN8nAccess(getDatabase(), session.userId);
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/student/tools"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Инструменты
        </Link>
        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <section>
            <span className="font-display flex size-16 items-center justify-center rounded-2xl bg-foreground text-xl text-background">
              n8n
            </span>
            <h1 className="font-display mt-6 text-4xl">n8n</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Выделенное рабочее пространство для практики по курсу.
            </p>
            <div className="mt-8">
              <StudentN8nAccessCard access={access} />
            </div>
          </section>
          <aside className="self-start rounded-2xl bg-highlight p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.08em]">
              Когда понадобится
            </p>
            <p className="mt-4 text-sm leading-6">
              В материалах про webhook и в практическом задании по обработке
              тестовой заявки.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
