"use client";

import {
  Check,
  Clipboard,
  Loader2,
  MessageCircleWarning,
  TextCursorInput,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

const MAX_DETAILS_LENGTH = 1_200;
const CLIPBOARD_TIMEOUT_MS = 2_000;

const problems = [
  "Страница не открывается",
  "Вижу экран первоначальной настройки",
  "Сервис сообщает об ошибке",
  "Другое",
] as const;

export function containsSecretLikeText(value: string): boolean {
  return (
    /(?:парол(?:ь|я)|password|token|токен|secret|api[ _-]?key|ключ)\s*[:=]\s*\S{4,}/iu.test(
      value,
    ) ||
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(value) ||
    /https?:\/\/[^\s/:@]+:[^\s/@]+@/iu.test(value) ||
    /\b(?:bearer\s+|sk-|ghp_|xox[baprs]-)[A-Za-z0-9._-]{12,}\b/iu.test(value) ||
    /\b[A-Za-z0-9_-]{40,}\b/u.test(value)
  );
}

export function buildToolProblemMessage(input: {
  state: string;
  problem: string;
  details: string;
}): { message: string; detailsOmitted: boolean } {
  const details = input.details.trim();
  const detailsOmitted = containsSecretLikeText(details);
  return {
    detailsOmitted,
    message: [
      "Проблема с учебным n8n",
      `Состояние в Neurokurs: ${input.state}`,
      `Что произошло: ${input.problem || "вариант ещё не выбран"}`,
      details && !detailsOmitted ? `Подробности: ${details}` : null,
      detailsOmitted
        ? "Подробности не включены: текст похож на секрет или credential."
        : null,
      "Перед отправкой проверьте текст и удалите личные или секретные данные.",
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

async function copyWithTimeout(message: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
  let timeout: number | undefined;
  try {
    await Promise.race([
      navigator.clipboard.writeText(message),
      new Promise<never>((_, reject) => {
        timeout = window.setTimeout(
          () => reject(new Error("clipboard_timeout")),
          CLIPBOARD_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) window.clearTimeout(timeout);
  }
}

export function ToolProblemDialog({ state }: { state: string }) {
  const [open, setOpen] = useState(false);
  const [problem, setProblem] = useState<string>("");
  const [details, setDetails] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<
    "idle" | "pending" | "success" | "manual"
  >("idle");
  const [copyError, setCopyError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLTextAreaElement>(null);
  const successRef = useRef<HTMLParagraphElement>(null);
  const attempt = useRef(0);
  const generated = useMemo(
    () => buildToolProblemMessage({ state, problem, details }),
    [details, problem, state],
  );
  const pending = copyStatus === "pending";

  useEffect(() => {
    if (copyStatus === "success") successRef.current?.focus();
  }, [copyStatus]);

  function reset() {
    attempt.current += 1;
    setProblem("");
    setDetails("");
    setValidationError(null);
    setCopyError(null);
    setCopyStatus("idle");
  }

  async function prepare(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!problem) {
      setValidationError("Выберите, что произошло.");
      firstRef.current?.focus();
      return;
    }
    const currentAttempt = ++attempt.current;
    setCopyStatus("pending");
    setCopyError(null);
    setValidationError(null);
    try {
      await copyWithTimeout(generated.message);
      if (attempt.current !== currentAttempt) return;
      setCopyStatus("success");
    } catch {
      if (attempt.current !== currentAttempt) return;
      setCopyStatus("manual");
      setCopyError(
        "Автокопирование недоступно. Текст остаётся ниже: выделите его вручную.",
      );
    }
  }

  function selectPreview() {
    previewRef.current?.focus();
    previewRef.current?.select();
    setCopyStatus("manual");
    setCopyError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <MessageCircleWarning aria-hidden="true" />
          Сообщить о проблеме
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        aria-busy={pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          firstRef.current?.focus();
        }}
      >
        <form onSubmit={prepare} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Что случилось с n8n?</DialogTitle>
            <DialogDescription className="text-base leading-7">
              Подготовьте сообщение и проверьте его перед отправкой. Никогда не
              добавляйте пароли, токены, ключи или персональные данные. Пошаговая
              диагностика доступна в{" "}
              <Link
                href="/student/help#tool-problem"
                className="font-medium text-foreground underline underline-offset-4"
              >
                памятке помощи
              </Link>
              .
            </DialogDescription>
          </DialogHeader>
          <fieldset
            className="grid gap-2"
            aria-describedby={
              validationError ? "tool-problem-validation-error" : undefined
            }
          >
            <legend className="mb-1 text-base font-medium">Выберите вариант</legend>
            {problems.map((item, index) => (
              <label
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-base transition-colors has-[:checked]:border-foreground has-[:checked]:bg-accent"
                key={item}
              >
                <input
                  ref={index === 0 ? firstRef : undefined}
                  type="radio"
                  name="tool-problem"
                  value={item}
                  checked={problem === item}
                  disabled={pending}
                  onChange={() => {
                    setProblem(item);
                    setValidationError(null);
                    setCopyStatus("idle");
                    setCopyError(null);
                  }}
                  className="size-4 accent-foreground"
                />
                {item}
              </label>
            ))}
            {validationError ? (
              <FieldError id="tool-problem-validation-error" aria-live="polite">
                {validationError}
              </FieldError>
            ) : null}
          </fieldset>
          <Field>
            <FieldLabel htmlFor="tool-problem-details" className="text-base">
              Что видно на экране
            </FieldLabel>
            <textarea
              id="tool-problem-details"
              className="min-h-28 w-full resize-y rounded-md border border-input bg-card px-3.5 py-3 text-base leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
              value={details}
              disabled={pending}
              maxLength={MAX_DETAILS_LENGTH}
              onChange={(event) => {
                setDetails(event.target.value);
                setCopyStatus("idle");
                setCopyError(null);
              }}
              placeholder="Коротко опишите текст ошибки и последний успешный шаг"
            />
            <FieldDescription className="text-base leading-6">
              До {MAX_DETAILS_LENGTH} знаков. Текст, похожий на secret или
              credential, не попадёт в сообщение.
            </FieldDescription>
          </Field>
          {generated.detailsOmitted ? (
            <div
              className="flex gap-3 rounded-lg border border-border bg-highlight p-4 text-sm leading-6"
              role="alert"
            >
              <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <p>
                Подробности похожи на секрет и исключены из сообщения. Удалите
                credential из поля, если хотите добавить остальной текст.
              </p>
            </div>
          ) : null}
          <Field>
            <FieldLabel htmlFor="tool-problem-preview" className="text-base">
              Предпросмотр сообщения
            </FieldLabel>
            <textarea
              ref={previewRef}
              id="tool-problem-preview"
              readOnly
              value={generated.message}
              className="min-h-40 w-full resize-y rounded-md border border-input bg-muted/45 px-3.5 py-3 font-mono text-sm leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
            />
            <FieldDescription className="text-base leading-6">
              Этот текст можно выделить вручную, даже если доступ к clipboard
              заблокирован браузером.
            </FieldDescription>
          </Field>
          {copyStatus === "success" ? (
            <p
              ref={successRef}
              tabIndex={-1}
              className="flex items-center gap-2 rounded-lg bg-highlight p-4 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring"
              role="status"
              aria-live="polite"
            >
              <Check className="size-5" aria-hidden="true" />
              Сообщение скопировано. Проверьте его и передайте удобным каналом.
            </p>
          ) : null}
          {copyError ? (
            <p className="text-sm text-destructive" role="alert">
              {copyError}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Закрыть
              </Button>
            </DialogClose>
            <Button type="button" variant="outline" onClick={selectPreview}>
              <TextCursorInput aria-hidden="true" />
              Выделить текст
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2
                  className="animate-spin motion-reduce:animate-none"
                  aria-hidden="true"
                />
              ) : (
                <Clipboard aria-hidden="true" />
              )}
              {pending ? "Копируем…" : "Скопировать сообщение"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
