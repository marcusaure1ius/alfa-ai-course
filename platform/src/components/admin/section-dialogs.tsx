"use client";

import { Loader2, Plus, Settings2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

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
import type {
  AdminCourseOption,
  AdminSectionOption,
} from "@/server/admin/workspace";

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

function sectionErrors(title: string, slug: string) {
  return {
    title: title.trim().length < 2 ? "Введите название раздела." : null,
    slug: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      ? null
      : "Используйте латиницу, цифры и дефисы.",
  };
}

export function SectionCreateDialog({
  courses,
  sections,
}: {
  courses: AdminCourseOption[];
  sections: AdminSectionOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const nextPosition = useMemo(() => {
    const positions = sections
      .filter((section) => section.courseId === courseId)
      .map((section) => section.position);
    return positions.length > 0 ? Math.max(...positions) + 1 : 0;
  }, [courseId, sections]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = sectionErrors(title, slug);
    setTitleError(next.title);
    setSlugError(next.slug);
    if (!courseId) {
      setError("Сначала создайте курс.");
      return;
    }
    if (next.title || next.slug) {
      (next.title ? titleRef : slugRef).current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/admin/courses/${courseId}/sections`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          title: title.trim(),
          slug,
          position: nextPosition,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Не удалось создать раздел.");
      }
      setOpen(false);
      setTitle("");
      setSlug("");
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось создать раздел.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" disabled={courses.length === 0}>
          <Plus aria-hidden="true" />
          Добавить раздел
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
            <DialogTitle>Новый раздел программы</DialogTitle>
            <DialogDescription>
              Раздел создастся черновиком. После этого в него можно добавить
              материалы и отдельно открыть ученикам.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <FieldLabel htmlFor="section-course">Курс</FieldLabel>
            <select
              id="section-course"
              className="h-12 w-full rounded-md border border-input bg-card px-3.5 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              disabled={pending}
            >
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="section-title">Название</FieldLabel>
              <Input
                ref={titleRef}
                id="section-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTitleError(null);
                }}
                maxLength={120}
                disabled={pending}
                aria-invalid={Boolean(titleError)}
                aria-describedby={titleError ? "section-title-error" : undefined}
              />
              {titleError ? (
                <FieldError id="section-title-error">{titleError}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="section-slug">Slug</FieldLabel>
              <Input
                ref={slugRef}
                id="section-slug"
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value.toLowerCase());
                  setSlugError(null);
                }}
                placeholder="start-here"
                disabled={pending}
                aria-invalid={Boolean(slugError)}
                aria-describedby={
                  slugError
                    ? "section-slug-help section-slug-error"
                    : "section-slug-help"
                }
              />
              <FieldDescription id="section-slug-help">
                Системный адрес внутри курса.
              </FieldDescription>
              {slugError ? (
                <FieldError id="section-slug-error">{slugError}</FieldError>
              ) : null}
            </Field>
          </div>
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
                <Plus aria-hidden="true" />
              )}
              {pending ? "Создаём…" : "Создать раздел"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function SectionEditDialog({ section }: { section: AdminSectionOption }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [slug, setSlug] = useState(section.slug);
  const [status, setStatus] = useState(section.status);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);

  function reset() {
    setTitle(section.title);
    setSlug(section.slug);
    setStatus(section.status);
    setError(null);
    setTitleError(null);
    setSlugError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = sectionErrors(title, slug);
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
      const response = await fetch(`/api/admin/sections/${section.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ title: title.trim(), slug, status }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Не удалось обновить раздел.");
      }
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось обновить раздел.",
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
        <Button type="button" variant="ghost" size="sm">
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
            <DialogTitle>Настроить раздел</DialogTitle>
            <DialogDescription>
              Изменения названия и видимости применятся ко всей программе курса.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor={`section-title-${section.id}`}>
                Название
              </FieldLabel>
              <Input
                ref={titleRef}
                id={`section-title-${section.id}`}
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTitleError(null);
                }}
                maxLength={120}
                disabled={pending}
                aria-invalid={Boolean(titleError)}
                aria-describedby={
                  titleError ? `section-title-error-${section.id}` : undefined
                }
              />
              {titleError ? (
                <FieldError id={`section-title-error-${section.id}`}>
                  {titleError}
                </FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor={`section-slug-${section.id}`}>Slug</FieldLabel>
              <Input
                ref={slugRef}
                id={`section-slug-${section.id}`}
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value.toLowerCase());
                  setSlugError(null);
                }}
                disabled={pending}
                aria-invalid={Boolean(slugError)}
                aria-describedby={
                  slugError ? `section-slug-error-${section.id}` : undefined
                }
              />
              {slugError ? (
                <FieldError id={`section-slug-error-${section.id}`}>
                  {slugError}
                </FieldError>
              ) : null}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor={`section-status-${section.id}`}>
              Видимость
            </FieldLabel>
            <select
              id={`section-status-${section.id}`}
              className="h-12 w-full rounded-md border border-input bg-card px-3.5 text-base outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
              value={status}
              onChange={(event) =>
                setStatus(event.target.value as "draft" | "published")
              }
              disabled={pending}
            >
              <option value="draft">Черновик — скрыт от учеников</option>
              <option value="published">Опубликован — виден ученикам</option>
            </select>
            <FieldDescription>
              Материалы раздела также должны быть опубликованы, чтобы ученик их
              увидел.
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
                <Settings2 aria-hidden="true" />
              )}
              {pending ? "Сохраняем…" : "Сохранить"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
