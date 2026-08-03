"use client";

import { Loader2, Save, Settings2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import type { AdminCourseItem } from "@/server/admin/workspace";

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

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return new Error(body?.error?.message ?? fallback);
}

function courseErrors(title: string, slug: string) {
  return {
    title: title.trim().length < 2 ? "Введите название курса." : null,
    slug:
      slug.length >= 2 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
        ? null
        : "Адрес должен содержать не меньше двух символов.",
  };
}

const pluralRules = new Intl.PluralRules("ru-RU");

function countLabel(
  count: number,
  words: { one: string; few: string; many: string },
): string {
  const form = pluralRules.select(count);
  const word = form === "one" ? words.one : form === "few" ? words.few : words.many;
  return `${count} ${word}`;
}

export function CourseSettingsDialog({
  course,
  sectionCount,
  taskCount,
}: {
  course: AdminCourseItem;
  sectionCount: number;
  taskCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [title, setTitle] = useState(course.title);
  const [slug, setSlug] = useState(course.slug);
  const [slugCustomized, setSlugCustomized] = useState(true);
  const [description, setDescription] = useState(course.description);
  const [status, setStatus] = useState(course.status);
  const [confirmationTitle, setConfirmationTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);

  function resetForm() {
    setTitle(course.title);
    setSlug(course.slug);
    setSlugCustomized(true);
    setDescription(course.description);
    setStatus(course.status);
    setError(null);
    setTitleError(null);
    setSlugError(null);
  }

  function showDeleteConfirmation() {
    setOpen(false);
    setConfirmationTitle("");
    setDeleteError(null);
    setDeleteOpen(true);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedSlug = createContentAddress(slug);
    const next = courseErrors(title, normalizedSlug);
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
      const response = await fetch(`/api/admin/courses/${course.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          title: title.trim(),
          slug: normalizedSlug,
          description: description.trim(),
          status,
        }),
      });
      if (!response.ok) {
        throw await responseError(response, "Не удалось сохранить курс.");
      }
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось сохранить курс.",
      );
    } finally {
      setPending(false);
    }
  }

  async function remove(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (confirmationTitle !== course.title) return;
    setPending(true);
    setDeleteError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/admin/courses/${course.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ confirmationTitle }),
      });
      if (!response.ok) {
        throw await responseError(response, "Не удалось удалить курс.");
      }
      setDeleteOpen(false);
      router.refresh();
    } catch (caught) {
      setDeleteError(
        caught instanceof Error ? caught.message : "Не удалось удалить курс.",
      );
    } finally {
      setPending(false);
    }
  }

  const sectionLabel = countLabel(sectionCount, {
    one: "раздел",
    few: "раздела",
    many: "разделов",
  });
  const taskLabel = countLabel(taskCount, {
    one: "задание",
    few: "задания",
    many: "заданий",
  });

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) resetForm();
        }}
      >
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="pointer-events-auto relative z-20 bg-card/95"
          >
            <Settings2 aria-hidden="true" />
            Настроить
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
              <DialogTitle>Настройки курса</DialogTitle>
              <DialogDescription>
                Измените данные курса и решите, виден ли он ученикам
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 sm:grid-cols-2 sm:gap-5">
              <Field className="grid-rows-[1.25rem_3rem_minmax(2.5rem,auto)]">
                <FieldLabel htmlFor={`course-title-${course.id}`}>
                  Название
                </FieldLabel>
                <Input
                  ref={titleRef}
                  id={`course-title-${course.id}`}
                  value={title}
                  onChange={(event) => {
                    const nextTitle = event.target.value;
                    setTitle(nextTitle);
                    if (!slugCustomized) {
                      setSlug(createContentAddress(nextTitle));
                    }
                    setTitleError(null);
                  }}
                  maxLength={120}
                  disabled={pending}
                  aria-invalid={Boolean(titleError)}
                  aria-describedby={
                    titleError
                      ? `course-title-error-${course.id}`
                      : `course-title-help-${course.id}`
                  }
                />
                {titleError ? (
                  <FieldError id={`course-title-error-${course.id}`}>
                    {titleError}
                  </FieldError>
                ) : (
                  <FieldDescription
                    id={`course-title-help-${course.id}`}
                    className="whitespace-nowrap"
                  >
                    Так курс увидят ученики
                  </FieldDescription>
                )}
              </Field>

              <Field className="grid-rows-[1.25rem_3rem_minmax(2.5rem,auto)]">
                <FieldLabel htmlFor={`course-slug-${course.id}`}>
                  Адрес курса
                </FieldLabel>
                <Input
                  ref={slugRef}
                  id={`course-slug-${course.id}`}
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
                  maxLength={80}
                  spellCheck={false}
                  autoCapitalize="none"
                  disabled={pending}
                  aria-invalid={Boolean(slugError)}
                  aria-describedby={
                    slugError
                      ? `course-slug-error-${course.id}`
                      : `course-slug-help-${course.id}`
                  }
                />
                {slugError ? (
                  <FieldError id={`course-slug-error-${course.id}`}>
                    {slugError}
                  </FieldError>
                ) : (
                  <FieldDescription
                    id={`course-slug-help-${course.id}`}
                    className="whitespace-nowrap"
                  >
                    Можно изменить вручную
                  </FieldDescription>
                )}
              </Field>
            </div>

            <Field>
              <FieldLabel htmlFor={`course-description-${course.id}`}>
                Описание
              </FieldLabel>
              <Textarea
                id={`course-description-${course.id}`}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={500}
                disabled={pending}
              />
              <FieldDescription>
                Коротко объясните, чему посвящён курс
              </FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor={`course-status-${course.id}`}>
                Видимость
              </FieldLabel>
              <Select
                value={status}
                onValueChange={(value) =>
                  setStatus(value as "draft" | "published")
                }
                disabled={pending}
              >
                <SelectTrigger
                  id={`course-status-${course.id}`}
                  className="h-12 w-full bg-card px-3.5 text-base md:text-sm"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" sideOffset={4}>
                  <SelectItem value="draft">Черновик</SelectItem>
                  <SelectItem value="published">Опубликован</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                Черновик скрыт от учеников, опубликованный курс доступен участникам
              </FieldDescription>
            </Field>

            {error ? <FieldError aria-live="polite">{error}</FieldError> : null}

            <DialogFooter className="gap-3 sm:justify-between">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                disabled={pending}
                onClick={showDeleteConfirmation}
              >
                <Trash2 aria-hidden="true" />
                Удалить курс
              </Button>
              <span className="flex flex-col-reverse gap-2 sm:flex-row">
                <DialogClose asChild>
                  <Button type="button" variant="outline" disabled={pending}>
                    Отмена
                  </Button>
                </DialogClose>
                <Button type="submit" disabled={pending}>
                  {pending ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Save aria-hidden="true" />
                  )}
                  {pending ? "Сохраняем…" : "Сохранить"}
                </Button>
              </span>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteOpen}
        onOpenChange={(next) => {
          if (pending) return;
          setDeleteOpen(next);
          if (!next) {
            setConfirmationTitle("");
            setDeleteError(null);
          }
        }}
      >
        <AlertDialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            confirmationRef.current?.focus();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить курс «{course.title}»?</AlertDialogTitle>
            <AlertDialogDescription>
              Это действие нельзя отменить. Вместе с курсом будут удалены {sectionLabel}, {taskLabel}, доступ к курсу и прогресс учеников.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor={`course-delete-${course.id}`}>
              Введите «{course.title}» для подтверждения
            </FieldLabel>
            <Input
              ref={confirmationRef}
              id={`course-delete-${course.id}`}
              value={confirmationTitle}
              onChange={(event) => {
                setConfirmationTitle(event.target.value);
                setDeleteError(null);
              }}
              autoComplete="off"
              disabled={pending}
            />
          </Field>
          {deleteError ? (
            <FieldError aria-live="polite">{deleteError}</FieldError>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pending || confirmationTitle !== course.title}
              onClick={remove}
            >
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              {pending ? "Удаляем…" : "Удалить навсегда"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
