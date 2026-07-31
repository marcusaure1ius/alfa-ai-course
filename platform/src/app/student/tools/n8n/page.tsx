import { ArrowLeft, ExternalLink, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function StudentN8nPage() {
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
            <div className="mt-8 rounded-2xl border bg-card p-6">
              <div className="flex items-start gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <LockKeyhole className="size-5" aria-hidden="true" />
                </span>
                <div>
                  <h2 className="font-display text-xl">Доступ ещё не подключён</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    Когда преподаватель подготовит инструмент, здесь появится
                    кнопка для входа.
                  </p>
                </div>
              </div>
              <Button className="mt-6" disabled>
                <ExternalLink aria-hidden="true" />
                Открыть n8n
              </Button>
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
