"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useTransition } from "react";

import { Button } from "@/components/ui/button";

export default function StudentError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section
      className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-2xl items-center px-5 py-16 sm:px-8"
      aria-labelledby="student-error-title"
    >
      <div>
        <p className="text-sm font-medium text-foreground">Не удалось загрузить данные</p>
        <h1
          ref={headingRef}
          id="student-error-title"
          tabIndex={-1}
          className="font-display mt-3 text-3xl outline-none"
        >
          Попробуйте открыть ещё раз
        </h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Доступ не изменён. Если ошибка повторится, откройте раздел помощи и
          сообщите преподавателю.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={() => startTransition(reset)}
            disabled={pending}
            aria-busy={pending}
          >
            <RotateCcw className={pending ? "animate-spin" : undefined} aria-hidden="true" />
            {pending ? "Повторяем…" : "Повторить"}
          </Button>
          <Button asChild variant="outline">
            <Link href="/student/help#student-error">Открыть помощь</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
