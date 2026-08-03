import {
  AlertTriangle,
  Clock3,
  ExternalLink,
  KeyRound,
  LockKeyhole,
  ServerCog,
} from "lucide-react";
import Link from "next/link";

import { N8nAccessRefresh } from "@/components/student/n8n-access-refresh";
import { ToolProblemDialog } from "@/components/student/tool-problem-dialog";
import { Button } from "@/components/ui/button";
import type {
  StudentN8nAccess,
  StudentN8nAccessState,
} from "@/server/tools/student-access";

type StateContent = {
  title: string;
  description: string;
  action: "help-access" | "refresh" | "launch" | "help-expired";
  autoRefresh?: boolean;
};

const copy: Record<StudentN8nAccessState, StateContent> = {
  locked: {
    title: "Доступ пока не выдан",
    description:
      "Сейчас n8n нельзя открыть. В памятке перечислено, что можно проверить со своей стороны.",
    action: "help-access",
  },
  license_blocked: {
    title: "Выдача доступа не завершена",
    description:
      "Запуск закрыт обязательной проверкой условий доступа. Это состояние нельзя обойти входом по сохранённой ссылке.",
    action: "help-access",
  },
  service_disabled: {
    title: "Вход временно закрыт",
    description:
      "Общий вход учеников в n8n сейчас выключен. Проверьте состояние повторно позднее.",
    action: "refresh",
  },
  preparing: {
    title: "Среда ещё не готова",
    description:
      "Доступ назначен, но обязательные проверки ещё не завершены. Экран проверит состояние несколько раз автоматически.",
    action: "refresh",
    autoRefresh: true,
  },
  owner_setup_required: {
    title: "Требуется настройка администратором",
    description:
      "Первоначальную настройку владельца выполняет только администратор. Не создавайте owner-аккаунт и не передавайте пароль.",
    action: "refresh",
    autoRefresh: true,
  },
  ready: {
    title: "n8n готов к работе",
    description:
      "Безопасный вход откроется в новой вкладке. Доступ проверяется заново при каждом запросе.",
    action: "launch",
  },
  attention: {
    title: "Среду сейчас нельзя открыть",
    description:
      "Проверка состояния не пройдена, поэтому ссылка скрыта. Попробуйте проверить ещё раз или подготовьте сообщение о проблеме.",
    action: "refresh",
    autoRefresh: true,
  },
  expired: {
    title: "Срок доступа завершён",
    description:
      "Запуск закрыт. В памятке описаны доступные следующие шаги без передачи паролей и ключей.",
    action: "help-expired",
  },
};

function StateIcon({ state }: { state: StudentN8nAccessState }) {
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

function PrimaryAction({
  access,
  content,
}: {
  access: StudentN8nAccess;
  content: StateContent;
}) {
  if (access.canLaunch) {
    return (
      <Button asChild>
        <a href={access.launchUrl} target="_blank" rel="noreferrer">
          <ExternalLink aria-hidden="true" />
          Открыть n8n
        </a>
      </Button>
    );
  }
  if (content.action === "refresh") {
    return (
      <N8nAccessRefresh state={access.state} auto={content.autoRefresh} />
    );
  }
  const expired = content.action === "help-expired";
  return (
    <Button asChild>
      <Link href={expired ? "/student/help#tool-expired" : "/student/help#course-access"}>
        {expired ? "Что делать дальше" : "Как получить доступ"}
      </Link>
    </Button>
  );
}

export function StudentN8nAccessCard({
  access,
}: {
  access: StudentN8nAccess;
}) {
  const content = copy[access.state];
  const formattedExpiry = access.expiresAt
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Europe/Moscow",
      }).format(new Date(access.expiresAt))
    : null;
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
          <StateIcon state={access.state} />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight">{content.title}</h2>
          <p className="mt-2 text-base leading-7 text-muted-foreground">
            {content.description}
          </p>
          {access.expiresAt && formattedExpiry ? (
            <p className="mt-3 text-sm font-medium text-muted-foreground">
              {access.state === "expired" ? "Действовал до" : "Доступ до"}{" "}
              <time dateTime={access.expiresAt}>{formattedExpiry}</time>
            </p>
          ) : null}
        </div>
      </div>
      <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap">
        <PrimaryAction access={access} content={content} />
        <ToolProblemDialog state={content.title} />
      </div>
    </div>
  );
}
