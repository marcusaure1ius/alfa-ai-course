import { ArrowRight, LockKeyhole, Wrench } from "lucide-react";
import Link from "next/link";

import { requirePageSession } from "@/server/auth/page-access";
import { getStudentWorkspaceCourse } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentToolsPage() {
  const session = await requirePageSession();
  const course = await getStudentWorkspaceCourse(getDatabase(), session.userId);
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
      <div className="mx-auto max-w-5xl">
        <p className="text-sm text-muted-foreground">Инструменты</p>
        <h1 className="font-display mt-2 text-3xl leading-tight sm:text-4xl">
          Учебные инструменты
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-muted-foreground">
          Здесь только сервисы, которые используются в материалах курса.
        </p>

        <section className="mt-9 overflow-hidden rounded-2xl border bg-card">
          <Link
            href="/student/tools/n8n"
            className="group grid gap-6 p-6 transition-colors hover:bg-accent sm:grid-cols-[auto_1fr_auto] sm:items-center sm:p-8"
          >
            <span className="font-display flex size-14 items-center justify-center rounded-2xl bg-foreground text-lg text-background">
              n8n
            </span>
            <span>
              <span className="font-display block text-2xl">n8n</span>
              <span className="mt-2 block max-w-2xl text-sm leading-6 text-muted-foreground">
                Рабочее пространство для webhook, автоматизаций и практических
                заданий курса.
              </span>
              <span className="mt-3 flex items-center gap-2 text-sm font-medium">
                <LockKeyhole className="size-4 text-muted-foreground" aria-hidden="true" />
                {course
                  ? "Состояние доступа — на странице инструмента"
                  : "Появится после выдачи доступа к курсу"}
              </span>
            </span>
            <ArrowRight
              className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1"
              aria-hidden="true"
            />
          </Link>
        </section>

        <div className="mt-8 flex items-start gap-3 rounded-2xl bg-brand-soft p-5">
          <Wrench className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
          <p className="text-sm leading-6 text-muted-foreground">
            Инструмент открывается из учебного контекста. IP-адреса, VPS и
            настройки провайдера остаются в административной части.
          </p>
        </div>
      </div>
    </div>
  );
}
