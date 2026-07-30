"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function StudentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-2xl items-center px-5 py-16">
      <div>
        <p className="text-sm font-medium text-brand">Не удалось загрузить данные</p>
        <h1 className="font-display mt-3 text-3xl">Попробуйте открыть ещё раз</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Доступ не изменён. Если ошибка повторится, откройте раздел помощи и
          сообщите преподавателю.
        </p>
        <Button type="button" className="mt-7" onClick={reset}>
          <RotateCcw aria-hidden="true" />
          Повторить
        </Button>
      </div>
    </section>
  );
}
