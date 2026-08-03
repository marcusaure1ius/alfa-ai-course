"use client";

import { FilePlus2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createContentAddress,
  sanitizeContentAddressInput,
} from "@/lib/content-address";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) {
    throw new Error("Не удалось подготовить защищённый запрос.");
  }
  return body.csrfToken;
}

function taskErrors(title: string, slug: string) {
  return {
    title: title.trim().length < 2 ? "Введите название задания." : null,
    slug:
      slug.length >= 2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        ? null
        : "Адрес должен содержать не меньше двух символов.",
  };
}

export function TaskCreateDialog({
  courseId,
  sectionId,
  sectionTitle,
  nextPosition,
}: {
  courseId: string;
  sectionId: string;
  sectionTitle: string;
  nextPosition: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugCustomized, setSlugCustomized] = useState(false);
  const [kind, setKind] = useState<"article" | "practice">("article");
  const [summary, setSummary] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTitle("");
    setSlug("");
    setSlugCustomized(false);
    setKind("article");
    setSummary("");
    setError(null);
    setTitleError(null);
    setSlugError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedSlug = createContentAddress(slug);
    const next = taskErrors(title, normalizedSlug);
    setSlug(normalizedSlug);
    setTitleError(next.title);
    setSlugError(next.slug);
    if (next.title || next.slug) {
      (next.title ? titleRef : slugRef).current?.focus();
      return;
    }

    setPending(true);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/admin/courses/${courseId}/materials`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          sectionId,
          slug: normalizedSlug,
          kind,
          title: title.trim(),
          summary: summary.trim(),
          bodyMarkdown: "",
          position: nextPosition,
          estimatedMinutes: null,
          status: "draft",
        }),
      });
      const body = (await response.json().catch(() => null)) as
        | { id?: string; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.id) {
        throw new Error(body?.error?.message ?? "Не удалось создать задание.");
      }
      setOpen(false);
      reset();
      router.push(`/admin/content/materials/${body.id}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось создать задание.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button">
          <FilePlus2 aria-hidden="true" />
          Создать задание
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-busy={pending}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          titleRef.current?.focus();
        }}
      >
        <form className="grid gap-5" onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Новое задание</DialogTitle>
            <DialogDescription>
              Создадим черновик в разделе «{sectionTitle}» и сразу откроем его
              для наполнения
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
            <Field className="grid-rows-[1.25rem_3rem_minmax(2.5rem,auto)]">
              <FieldLabel htmlFor={`task-title-${sectionId}`}>
                Название
              </FieldLabel>
              <Input
                ref={titleRef}
                id={`task-title-${sectionId}`}
                value={title}
                onChange={(event) => {
                  const nextTitle = event.target.value;
                  setTitle(nextTitle);
                  if (!slugCustomized) {
                    setSlug(createContentAddress(nextTitle));
                  }
                  setTitleError(null);
                }}
                maxLength={160}
                disabled={pending}
                aria-invalid={Boolean(titleError)}
                aria-describedby={
                  titleError
                    ? `task-title-error-${sectionId}`
                    : `task-title-help-${sectionId}`
                }
              />
              {titleError ? (
                <FieldError id={`task-title-error-${sectionId}`}>
                  {titleError}
                </FieldError>
              ) : (
                <FieldDescription
                  id={`task-title-help-${sectionId}`}
                  className="whitespace-nowrap"
                >
                  Так задание увидят ученики
                </FieldDescription>
              )}
            </Field>

            <Field className="grid-rows-[1.25rem_3rem_minmax(2.5rem,auto)]">
              <FieldLabel htmlFor={`task-slug-${sectionId}`}>
                Адрес задания
              </FieldLabel>
              <Input
                ref={slugRef}
                id={`task-slug-${sectionId}`}
                value={slug}
                onChange={(event) => {
                  const sanitizedValue = sanitizeContentAddressInput(
                    event.target.value,
                  );
                  setSlug(sanitizedValue);
                  setSlugCustomized(sanitizedValue.length > 0);
                  setSlugError(null);
                }}
                onBlur={() => {
                  const normalizedSlug = createContentAddress(slug);
                  if (normalizedSlug) {
                    setSlug(normalizedSlug);
                    return;
                  }
                  setSlug(createContentAddress(title));
                  setSlugCustomized(false);
                }}
                placeholder="pervaya-zadacha"
                maxLength={80}
                spellCheck={false}
                autoCapitalize="none"
                disabled={pending}
                aria-invalid={Boolean(slugError)}
                aria-describedby={
                  slugError
                    ? `task-slug-error-${sectionId}`
                    : `task-slug-help-${sectionId}`
                }
              />
              {slugError ? (
                <FieldError id={`task-slug-error-${sectionId}`}>
                  {slugError}
                </FieldError>
              ) : (
                <FieldDescription
                  id={`task-slug-help-${sectionId}`}
                  className="whitespace-nowrap"
                >
                  Автоматически — можно изменить
                </FieldDescription>
              )}
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor={`task-kind-${sectionId}`}>Тип</FieldLabel>
            <Select
              value={kind}
              onValueChange={(value) =>
                setKind(value as "article" | "practice")
              }
              disabled={pending}
            >
              <SelectTrigger
                id={`task-kind-${sectionId}`}
                className="h-12 w-full bg-card px-3.5 text-base md:text-sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start" sideOffset={4}>
                <SelectItem value="article">Теория</SelectItem>
                <SelectItem value="practice">Практика</SelectItem>
              </SelectContent>
            </Select>
            <FieldDescription>
              Тип помогает ученику понять формат следующего шага
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor={`task-summary-${sectionId}`}>
              Короткое описание
            </FieldLabel>
            <Textarea
              id={`task-summary-${sectionId}`}
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={500}
              disabled={pending}
            />
            <FieldDescription>
              Можно оставить пустым и заполнить позже в редакторе
            </FieldDescription>
          </Field>

          {error ? <FieldError aria-live="polite">{error}</FieldError> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                Отмена
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <FilePlus2 aria-hidden="true" />
              )}
              {pending ? "Создаём…" : "Создать и открыть"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
