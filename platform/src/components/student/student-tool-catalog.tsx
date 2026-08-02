import {
  AlertTriangle,
  ArrowRight,
  Box,
  CircleCheck,
  Clock3,
  KeyRound,
  LockKeyhole,
  PauseCircle,
  ServerCog,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import type { StudentToolCatalogItem } from "@/lib/student-tool-catalog";
import type { StudentN8nAccessState } from "@/server/tools/student-access";

type StatePresentation = {
  title: string;
  description: string;
  action: string;
  icon: typeof LockKeyhole;
};

const statePresentation: Record<StudentN8nAccessState, StatePresentation> = {
  locked: {
    title: "Доступ не подключён",
    description: "Когда преподаватель откроет доступ, здесь появится возможность войти.",
    action: "Подробнее",
    icon: LockKeyhole,
  },
  license_blocked: {
    title: "Доступ временно закрыт",
    description: "Преподавателю нужно завершить обязательную проверку сервиса.",
    action: "Подробнее",
    icon: AlertTriangle,
  },
  service_disabled: {
    title: "Сервис временно закрыт",
    description: "Общий вход приостановлен. Ваше назначение и срок доступа сохранены.",
    action: "Подробнее",
    icon: PauseCircle,
  },
  preparing: {
    title: "Сервис готовится",
    description: "Доступ назначен. Ссылка появится после завершения проверки.",
    action: "Подробнее",
    icon: ServerCog,
  },
  owner_setup_required: {
    title: "Нужна первоначальная настройка",
    description: "Откройте карточку инструмента и следуйте инструкции перед началом работы.",
    action: "Продолжить настройку",
    icon: KeyRound,
  },
  ready: {
    title: "Можно работать",
    description: "Инструмент готов к учебной практике.",
    action: "Открыть инструмент",
    icon: CircleCheck,
  },
  attention: {
    title: "Нужна проверка",
    description: "Ссылка скрыта, пока преподаватель проверяет состояние сервиса.",
    action: "Что делать дальше",
    icon: AlertTriangle,
  },
  expired: {
    title: "Срок доступа завершён",
    description: "В карточке инструмента описано, как запросить продление.",
    action: "Что делать дальше",
    icon: Clock3,
  },
};

export function StudentToolCatalog({ tools }: { tools: StudentToolCatalogItem[] }) {
  if (tools.length === 0) {
    return (
      <section className="mt-9 rounded-xl border bg-card p-6 sm:p-8" aria-labelledby="student-tools-empty-title">
        <h2 id="student-tools-empty-title" className="font-display text-xl">
          Инструменты пока не добавлены
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Когда для курса появится учебный сервис, он будет показан здесь вместе со статусом доступа.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-9" aria-labelledby="student-tools-title">
      <h2 id="student-tools-title" className="sr-only">Каталог учебных инструментов</h2>
      <ul className="grid gap-5" aria-label="Каталог учебных инструментов">
        {tools.map((tool) => {
          const presentation = statePresentation[tool.entitlement.state];
          const StateIcon = presentation.icon;
          return (
            <li key={tool.id} className="min-w-0">
              <article className="group rounded-xl border bg-card p-5 transition-colors hover:border-foreground/25 focus-within:border-foreground/25 sm:p-7">
                <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-start">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-foreground text-background" aria-hidden="true">
                    <Box className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display break-words text-2xl [overflow-wrap:anywhere]">
                      {tool.name}
                    </h3>
                    <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                      {tool.description}
                    </p>
                    <div className="mt-5 flex min-w-0 items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                        <StateIcon className="size-5" aria-hidden="true" />
                      </span>
                      <div className="min-w-0">
                        <p className="font-medium">{presentation.title}</p>
                        <p className="mt-1 break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">
                          {presentation.description}
                        </p>
                      </div>
                    </div>
                    <Button asChild variant="outline" className="mt-5 min-h-11 max-w-full">
                      <Link
                        href={tool.studentHref}
                        aria-label={`${presentation.action}: ${tool.name}`}
                        className="min-w-0 focus-visible:outline-solid"
                      >
                        <span className="truncate">{presentation.action}</span>
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </article>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
