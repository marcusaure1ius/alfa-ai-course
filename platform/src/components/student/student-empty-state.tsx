import { ArrowRight, BookOpenText, LockKeyhole } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

type StudentEmptyStateProps = {
  kind: "locked" | "empty" | "missing";
};

const content = {
  locked: {
    icon: LockKeyhole,
    title: "Доступ к курсу ещё не открыт",
    description:
      "Как только преподаватель добавит вас в курс, программа и материалы появятся здесь.",
    action: "Что делать дальше",
    href: "/student/help",
  },
  empty: {
    icon: BookOpenText,
    title: "Программа готовится",
    description:
      "Доступ уже есть. Первый опубликованный материал появится здесь без дополнительных действий.",
    action: "Открыть программу",
    href: "/student/program",
  },
  missing: {
    icon: LockKeyhole,
    title: "Материал недоступен",
    description:
      "Возможно, он ещё не опубликован или доступ к курсу изменился. Вернитесь в программу и выберите доступный материал.",
    action: "Вернуться в программу",
    href: "/student/program",
  },
} as const;

export function StudentEmptyState({ kind }: StudentEmptyStateProps) {
  const item = content[kind];
  const Icon = item.icon;
  return (
    <section className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-2xl items-center px-5 py-16 sm:px-8">
      <div>
        <span className="flex size-11 items-center justify-center rounded-xl bg-highlight text-foreground">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <h1 className="font-display mt-6 text-3xl leading-tight sm:text-4xl">
          {item.title}
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          {item.description}
        </p>
        <Button asChild className="mt-7">
          <Link href={item.href}>
            {item.action}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
