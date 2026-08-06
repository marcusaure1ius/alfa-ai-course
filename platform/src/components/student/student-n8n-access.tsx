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
  action: "help-access" | "refresh" | "launch" | "invite" | "help-expired";
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
      "Доступ закрыт обязательной проверкой условий. Пока она не пройдена, аккаунт в инструменте не выдаётся.",
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
  invite_pending: {
    title: "Аккаунт создан — задайте пароль",
    description:
      "Логин — тот же адрес почты, под которым вы вошли в Neurokurs. Пароль вы придумываете сами на странице приглашения: платформа его не задаёт, не хранит и не показывает. Ссылка одноразовая, после неё входите в n8n напрямую.",
    action: "invite",
  },
  ready: {
    title: "n8n готов к работе",
    description:
      "Вход в новой вкладке по вашему аккаунту n8n: логин — адрес почты, пароль вы задали сами. Платформа вход не выполняет и пароль не хранит.",
    action: "launch",
  },
  attention: {
    title: "Среду сейчас нельзя открыть",
    description:
      "Проверка состояния не пройдена, поэтому адрес инструмента пока не показан. Попробуйте проверить ещё раз или подготовьте сообщение о проблеме.",
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

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

function StateIcon({ state }: { state: StudentN8nAccessState }) {
  const Icon =
    state === "ready"
      ? ExternalLink
      : state === "invite_pending" || state === "owner_setup_required"
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
  // Пароль задаётся один раз по одноразовому приглашению, поэтому рядом остаётся
  // проверка состояния: ученик возвращается сюда уже с рабочим аккаунтом.
  if (access.state === "invite_pending") {
    return (
      <>
        <Button asChild>
          <a href={access.inviteUrl} target="_blank" rel="noreferrer">
            <KeyRound aria-hidden="true" />
            Задать пароль
          </a>
        </Button>
        <N8nAccessRefresh state={access.state} />
      </>
    );
  }
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
  // Адрес показывается текстом, а не только ссылкой на кнопке: ученик должен
  // узнавать инструмент по его настоящему хосту.
  const toolHost = access.launchUrl ? safeHost(access.launchUrl) : null;
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
          {toolHost ? (
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Адрес инструмента:{" "}
              <a
                className="font-medium text-foreground underline underline-offset-4"
                href={access.launchUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
              >
                {toolHost}
              </a>
            </p>
          ) : null}
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
