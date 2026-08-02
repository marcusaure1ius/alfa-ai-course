"use client";

import { Check, Clipboard, Loader2, MessageCircleWarning } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

const problems = [
  "Страница не открывается",
  "Вижу экран первоначальной настройки",
  "Сервис сообщает об ошибке",
  "Другое",
] as const;

export function ToolProblemDialog({ state }: { state: string }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string>("");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, setPending] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!problem) {
      setError("Выберите, что произошло.");
      firstRef.current?.focus();
      return;
    }
    const message = [
      "Проблема с учебным n8n",
      `Состояние в Neurokurs: ${state}`,
      `Что произошло: ${problem}`,
      details.trim() ? `Подробности: ${details.trim()}` : null,
      "Credentials и пароли не прикладывались.",
    ].filter(Boolean).join("\n");
    setPending(true);
    setError(null);
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setError("Не удалось скопировать. Выделите описание вручную и передайте преподавателю.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (pending) return;
      setOpen(next);
      if (!next) {
        setCopied(false);
        setError(null);
      }
    }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline"><MessageCircleWarning aria-hidden="true" />Сообщить о проблеме</Button>
      </DialogTrigger>
      <DialogContent aria-busy={pending} onOpenAutoFocus={(event) => {
        event.preventDefault();
        firstRef.current?.focus();
      }}>
        {copied ? (
          <>
            <DialogHeader>
              <span className="mb-2 flex size-12 items-center justify-center rounded-full bg-highlight"><Check aria-hidden="true" /></span>
              <DialogTitle>Сообщение подготовлено</DialogTitle>
              <DialogDescription>
                Текст скопирован. Передайте его преподавателю привычным каналом — пароли и инфраструктурные данные в сообщение не включены.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button asChild variant="outline">
                <Link href="/student/help#tool-problem">Открыть памятку</Link>
              </Button>
              <DialogClose asChild><Button type="button">Готово</Button></DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={prepare} className="grid gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>Что случилось с n8n?</DialogTitle>
              <DialogDescription>
                Подготовим безопасное сообщение без логинов, паролей, ключей и
                технических секретов. Пошаговая диагностика доступна в{" "}
                <Link
                  href="/student/help#tool-problem"
                  className="font-medium text-foreground underline underline-offset-4"
                >
                  памятке помощи
                </Link>
                .
              </DialogDescription>
            </DialogHeader>
            <fieldset className="grid gap-2" aria-describedby={error ? "tool-problem-error" : undefined}>
              <legend className="mb-1 text-sm font-medium">Выберите вариант</legend>
              {problems.map((item, index) => (
                <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm transition-colors has-[:checked]:border-foreground has-[:checked]:bg-accent" key={item}>
                  <input
                    ref={index === 0 ? firstRef : undefined}
                    type="radio"
                    name="tool-problem"
                    value={item}
                    checked={problem === item}
                    disabled={pending}
                    onChange={() => {
                      setProblem(item);
                      setError(null);
                    }}
                    className="size-4 accent-black"
                  />
                  {item}
                </label>
              ))}
              {error ? <FieldError id="tool-problem-error">{error}</FieldError> : null}
            </fieldset>
            <Field>
              <FieldLabel htmlFor="tool-problem-details">Что видно на экране</FieldLabel>
              <textarea
                id="tool-problem-details"
                className="min-h-28 w-full resize-y rounded-md border border-input bg-card px-3.5 py-3 text-base leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
                value={details}
                disabled={pending}
                onChange={(event) => setDetails(event.target.value)}
                placeholder="Коротко опишите текст ошибки и последний успешный шаг"
              />
              <FieldDescription>Не вставляйте пароли, токены, ключи или персональные данные.</FieldDescription>
            </Field>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Отмена</Button></DialogClose>
              <Button type="submit" disabled={pending}>
                {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Clipboard aria-hidden="true" />}
                {pending ? "Копируем…" : "Скопировать сообщение"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
