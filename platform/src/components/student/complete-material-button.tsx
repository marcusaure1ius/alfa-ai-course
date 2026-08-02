"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { FieldError } from "@/components/ui/field";

export function CompleteMaterialButton({
  materialId,
  completed,
  nextHref,
  triggerVariant = "default",
  triggerLabel = "Завершить материал",
}: {
  materialId: string;
  completed: boolean;
  nextHref: string | null;
  triggerVariant?: "default" | "outline";
  triggerLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const successTitleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (success) successTitleRef.current?.focus();
  }, [success]);

  async function updateProgress(nextCompleted: boolean) {
    setPending(true);
    setError(null);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const csrf = (await csrfResponse.json()) as { csrfToken?: string };
      if (!csrf.csrfToken) throw new Error("CSRF");
      const response = await fetch(`/api/student/materials/${materialId}/progress`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.csrfToken,
        },
        body: JSON.stringify({ lastPosition: null, completed: nextCompleted }),
      });
      if (!response.ok) throw new Error("UPDATE_FAILED");
      if (nextCompleted) {
        setSuccess(true);
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError("Не удалось сохранить. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  if (completed) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Button type="button" variant="outline" onClick={() => void updateProgress(false)} disabled={pending} aria-busy={pending}>
          {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
          Отметить непройденным
        </Button>
        {error ? <FieldError>{error}</FieldError> : null}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (pending) return;
      const refreshAfterSuccess = !next && success;
      setOpen(next);
      if (!next) {
        setSuccess(false);
        setError(null);
        if (refreshAfterSuccess) router.refresh();
      }
    }}>
      <DialogTrigger asChild>
        <Button type="button" variant={triggerVariant}>
          <Check aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        {success ? (
          <>
            <p className="sr-only" role="status" aria-live="polite">
              Материал завершён. Прогресс сохранён.
            </p>
            <DialogHeader>
              <span className="mb-2 flex size-12 items-center justify-center rounded-full bg-highlight text-foreground">
                <Check aria-hidden="true" />
              </span>
              <DialogTitle ref={successTitleRef} tabIndex={-1}>
                Материал завершён
              </DialogTitle>
              <DialogDescription>
                Прогресс сохранён. Можно перейти к следующему шагу или вернуться в программу.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              {nextHref ? (
                <>
                  <Button asChild variant="outline">
                    <Link href="/student/program">В программу</Link>
                  </Button>
                  <Button asChild>
                    <Link href={nextHref}>
                      Следующий материал
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </>
              ) : (
                <Button asChild>
                  <Link href="/student/program">
                    В программу
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              )}
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Завершить материал?</DialogTitle>
              <DialogDescription>
                Мы отметим этот шаг пройденным и обновим ваше место в программе. Отметку можно снять позже.
              </DialogDescription>
            </DialogHeader>
            {error ? <FieldError aria-live="polite">{error}</FieldError> : null}
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Отмена</Button></DialogClose>
              <Button type="button" onClick={() => void updateProgress(true)} disabled={pending} aria-busy={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Check aria-hidden="true" />}
                {pending ? "Сохраняем…" : "Да, завершить"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
