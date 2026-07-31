"use client";

import { Check, ClipboardCheck, ExternalLink } from "lucide-react";
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
import { Input } from "@/components/ui/input";

export function PracticeSubmissionDialog({ materialId }: { materialId: string }) {
  const storageKey = `neurokurs:practice-draft:${materialId}`;
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function saveDraft(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      setError("Вставьте полную ссылку, начинающуюся с https://");
      inputRef.current?.focus();
      return;
    }
    if (parsed.protocol !== "https:") {
      setError("Для безопасности используйте ссылку с https://");
      inputRef.current?.focus();
      return;
    }
    window.localStorage.setItem(storageKey, url);
    setSaved(true);
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setUrl(window.localStorage.getItem(storageKey) ?? "");
        setOpen(next);
        if (!next) {
          setSaved(false);
          setError(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline"><ClipboardCheck aria-hidden="true" />Подготовить ответ</Button>
      </DialogTrigger>
      <DialogContent onOpenAutoFocus={(event) => {
        event.preventDefault();
        inputRef.current?.focus();
      }}>
        {saved ? (
          <>
            <DialogHeader>
              <span className="mb-2 flex size-12 items-center justify-center rounded-full bg-highlight"><Check aria-hidden="true" /></span>
              <DialogTitle>Черновик сохранён</DialogTitle>
              <DialogDescription>
                Ссылка сохранена только в этом браузере. Автоматическая отправка преподавателю пока не подключена — интерфейс не создаёт ложного статуса проверки.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild><Button type="button">Готово</Button></DialogClose>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={saveDraft} className="grid gap-5" noValidate>
            <DialogHeader>
              <DialogTitle>Ссылка на практическое задание</DialogTitle>
              <DialogDescription>
                Подготовьте ссылку на сценарий или другой результат. До
                подключения проверки это безопасный локальный черновик.
              </DialogDescription>
            </DialogHeader>
            <Field>
              <FieldLabel htmlFor="practice-url">Ссылка на результат</FieldLabel>
              <div className="relative">
                <ExternalLink className="pointer-events-none absolute left-3.5 top-4 size-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  ref={inputRef}
                  id="practice-url"
                  type="url"
                  inputMode="url"
                  placeholder="https://…"
                  className="pl-10"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                    if (error) setError(null);
                  }}
                  aria-invalid={Boolean(error)}
                  aria-describedby={
                    error
                      ? "practice-url-help practice-url-error"
                      : "practice-url-help"
                  }
                />
              </div>
              <FieldDescription id="practice-url-help">
                Проверьте, что ссылка открывается без доступа к вашим логинам,
                паролям и ключам.
              </FieldDescription>
              {error ? <FieldError id="practice-url-error">{error}</FieldError> : null}
            </Field>
            <DialogFooter>
              <DialogClose asChild><Button type="button" variant="outline">Отмена</Button></DialogClose>
              <Button type="submit">Сохранить черновик</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
