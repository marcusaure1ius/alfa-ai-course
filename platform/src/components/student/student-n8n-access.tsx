import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  ServerCog,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { ToolProblemDialog } from "@/components/student/tool-problem-dialog";
import type { StudentN8nAccess } from "@/server/tools/student-access";

const copy: Record<
  StudentN8nAccess["state"],
  { title: string; description: string }
> = {
  locked: {
    title: "Доступ ещё не подключён",
    description:
      "Когда преподаватель подготовит инструмент и откроет доступ, здесь появится кнопка для входа.",
  },
  license_blocked: {
    title: "Доступ временно закрыт",
    description:
      "Среда подготовлена, но преподавателю нужно завершить обязательную проверку перед выдачей ссылки.",
  },
  preparing: {
    title: "Среда готовится",
    description:
      "Доступ уже назначен. Ссылка появится после завершения автоматических проверок.",
  },
  owner_setup_required: {
    title: "Завершите первоначальную настройку",
    description:
      "Откройте n8n. Если сервис показывает стартовый экран, создайте owner-аккаунт самостоятельно. Neurokurs не создаёт его скрыто и никогда не просит прислать пароль.",
  },
  ready: {
    title: "Рабочее пространство готово",
    description:
      "Откройте n8n и продолжайте практическое задание в отдельной вкладке.",
  },
  attention: {
    title: "Инструмент требует проверки",
    description:
      "Ссылка временно скрыта. Преподаватель видит техническое состояние и может безопасно восстановить среду.",
  },
  expired: {
    title: "Срок доступа завершён",
    description:
      "Попросите преподавателя продлить доступ или получить инструкцию самостоятельного запуска. Перенос VPS и облачного аккаунта не выполняется автоматически.",
  },
};

function StateIcon({ state }: { state: StudentN8nAccess["state"] }) {
  const Icon =
    state === "ready"
      ? ExternalLink
      : state === "owner_setup_required"
        ? KeyRound
        : state === "preparing"
          ? ServerCog
          : state === "expired"
            ? Clock3
            : state === "attention"
              ? AlertTriangle
              : LockKeyhole;
  return <Icon className="size-5" aria-hidden="true" />;
}

export function StudentN8nAccessCard({
  access,
}: {
  access: StudentN8nAccess;
}) {
  const content = copy[access.state];
  const available = Boolean(access.launchUrl);
  return (
    <div className="rounded-xl border bg-card p-6">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <StateIcon state={access.state} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl">{content.title}</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {content.description}
          </p>
          {access.expiresAt ? (
            <p className="mt-3 text-xs font-medium text-muted-foreground">
              Доступ до{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                dateStyle: "long",
                timeZone: "Europe/Moscow",
              }).format(new Date(access.expiresAt))}
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
      {available ? (
        <Button asChild>
          <a href={access.launchUrl ?? "#"} target="_blank" rel="noreferrer">
            <ExternalLink aria-hidden="true" />
            Открыть n8n
          </a>
        </Button>
      ) : (
        <Button disabled>
          <ExternalLink aria-hidden="true" />
          Открыть n8n
        </Button>
      )}
      <ToolProblemDialog state={content.title} />
      </div>
      {access.state === "expired" ? (
        <Button asChild variant="link" className="mt-2 px-0">
          <Link href="/student/help">Что делать после окончания доступа</Link>
        </Button>
      ) : null}
    </div>
  );
}
