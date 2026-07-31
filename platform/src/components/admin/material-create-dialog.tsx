"use client";

import { FilePlus2, Loader2 } from "lucide-react";
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
import type { AdminSectionOption } from "@/server/admin/workspace";

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

export function MaterialCreateDialog({
  sections,
}: {
  sections: AdminSectionOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [summary, setSummary] = useState("");
  const [kind, setKind] = useState<"article" | "practice">("article");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLSelectElement>(null);

  const selectedSection = useMemo(
    () => sections.find((section) => section.id === sectionId),
    [sectionId, sections],
  );

  function reset() {
    setSectionId(sections[0]?.id ?? "");
    setTitle("");
    setSlug("");
    setSummary("");
    setKind("article");
    setError(null);
    setTitleError(null);
    setSlugError(null);
    setSectionError(null);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextSectionError = sectionId ? null : "Сначала выберите раздел.";
    const nextTitleError =
      title.trim().length < 2 ? "Введите название материала." : null;
    const nextSlugError = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
      ? null
      : "Используйте латиницу, цифры и дефисы.";
    setSectionError(nextSectionError);
    setTitleError(nextTitleError);
    setSlugError(nextSlugError);
    if (nextSectionError || nextTitleError || nextSlugError) {
      if (nextSectionError) sectionRef.current?.focus();
      else if (nextTitleError) titleRef.current?.focus();
      else slugRef.current?.focus();
      return;
    }
    if (!selectedSection) return;

    setPending(true);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch(
        `/api/admin/courses/${selectedSection.courseId}/materials`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf,
          },
          body: JSON.stringify({
            sectionId,
            slug,
            kind,
            title: title.trim(),
            summary: summary.trim(),
            bodyMarkdown: "",
            position: selectedSection.nextMaterialPosition,
            estimatedMinutes: null,
            status: "draft",
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | { id?: string; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.id) {
        throw new Error(body?.error?.message ?? "Не удалось создать материал.");
      }
      setOpen(false);
      reset();
      router.push(`/admin/content/materials/${body.id}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось создать материал.",
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
        <Button type="button" disabled={sections.length === 0}>
          <FilePlus2 aria-hidden="true" />
          Создать материал
        </Button>
      </DialogTrigger>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          sectionRef.current?.focus();
        }}
      >
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Создать материал</DialogTitle>
            <DialogDescription>
              Материал сохранится черновиком. Содержание и публикацию можно
              настроить на следующем экране.
            </DialogDescription>
          </DialogHeader>

          <Field>
            <FieldLabel htmlFor="material-section">Раздел</FieldLabel>
            <select
              ref={sectionRef}
              id="material-section"
              value={sectionId}
              onChange={(event) => {
                setSectionId(event.target.value);
                setSectionError(null);
              }}
              className="h-12 w-full rounded-md border border-input bg-card px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
              aria-invalid={Boolean(sectionError)}
              aria-describedby={sectionError ? "material-section-error" : undefined}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.courseTitle} / {section.title}
                </option>
              ))}
            </select>
            {sectionError ? (
              <FieldError id="material-section-error">{sectionError}</FieldError>
            ) : null}
          </Field>

          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="material-title">Название</FieldLabel>
              <Input
                ref={titleRef}
                id="material-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                  setTitleError(null);
                }}
                maxLength={160}
                aria-invalid={Boolean(titleError)}
                aria-describedby={titleError ? "material-title-error" : undefined}
              />
              {titleError ? (
                <FieldError id="material-title-error">{titleError}</FieldError>
              ) : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="material-slug">Slug</FieldLabel>
              <Input
                ref={slugRef}
                id="material-slug"
                value={slug}
                onChange={(event) => {
                  setSlug(event.target.value.toLowerCase());
                  setSlugError(null);
                }}
                placeholder="pervyy-workflow"
                aria-invalid={Boolean(slugError)}
                aria-describedby={
                  slugError
                    ? "material-slug-help material-slug-error"
                    : "material-slug-help"
                }
              />
              <FieldDescription id="material-slug-help">
                Латиница, цифры и дефисы.
              </FieldDescription>
              {slugError ? (
                <FieldError id="material-slug-error">{slugError}</FieldError>
              ) : null}
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="material-kind">Тип</FieldLabel>
            <select
              id="material-kind"
              value={kind}
              onChange={(event) =>
                setKind(event.target.value as "article" | "practice")
              }
              className="h-12 w-full rounded-md border border-input bg-card px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
            >
              <option value="article">Материал</option>
              <option value="practice">Практика</option>
            </select>
          </Field>

          <Field>
            <FieldLabel htmlFor="material-summary">Короткое описание</FieldLabel>
            <textarea
              id="material-summary"
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              maxLength={500}
              className="min-h-24 resize-y rounded-md border border-input bg-card px-3.5 py-3 text-base leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm"
            />
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
              {pending ? "Создаём…" : "Создать материал"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
