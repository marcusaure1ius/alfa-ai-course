"use client";

import { Loader2, Plus } from "lucide-react";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { cache: "no-store", credentials: "same-origin" });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("Не удалось подготовить защищённый запрос.");
  return body.csrfToken;
}

export function CourseCreateForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [slugError, setSlugError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const slugRef = useRef<HTMLInputElement>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitleError = title.trim().length < 2 ? "Введите название курса." : null;
    const nextSlugError = !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? "Используйте латиницу, цифры и дефисы." : null;
    setTitleError(nextTitleError);
    setSlugError(nextSlugError);
    if (nextTitleError || nextSlugError) {
      (nextTitleError ? titleRef : slugRef).current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch("/api/admin/courses", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ title, slug, description }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "Не удалось создать курс.");
      }
      setOpen(false);
      setTitle("");
      setSlug("");
      setDescription("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать курс.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      <DialogTrigger asChild><Button type="button" variant="outline"><Plus aria-hidden="true" />Создать курс</Button></DialogTrigger>
      <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); titleRef.current?.focus(); }}>
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <DialogHeader>
            <DialogTitle>Создать курс</DialogTitle>
            <DialogDescription>Новый курс появится как черновик и не будет виден ученикам до публикации.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="course-title">Название</FieldLabel>
              <Input ref={titleRef} id="course-title" value={title} onChange={(event) => { setTitle(event.target.value); setTitleError(null); }} maxLength={120} aria-invalid={Boolean(titleError)} aria-describedby={titleError ? "course-title-error" : undefined} />
              {titleError ? <FieldError id="course-title-error">{titleError}</FieldError> : null}
            </Field>
            <Field>
              <FieldLabel htmlFor="course-slug">Slug</FieldLabel>
              <Input ref={slugRef} id="course-slug" value={slug} onChange={(event) => { setSlug(event.target.value.toLowerCase()); setSlugError(null); }} placeholder="n8n-start" aria-invalid={Boolean(slugError)} aria-describedby={slugError ? "course-slug-help course-slug-error" : "course-slug-help"} />
              <FieldDescription id="course-slug-help">Адрес курса: латиница, цифры и дефисы.</FieldDescription>
              {slugError ? <FieldError id="course-slug-error">{slugError}</FieldError> : null}
            </Field>
          </div>
          <Field>
            <FieldLabel htmlFor="course-description">Описание</FieldLabel>
            <textarea id="course-description" className="min-h-24 resize-y rounded-md border border-input bg-card px-3.5 py-3 text-base leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={500} />
          </Field>
          {error ? <FieldError aria-live="polite">{error}</FieldError> : null}
          <DialogFooter>
            <DialogClose asChild><Button type="button" variant="outline" disabled={pending}>Отмена</Button></DialogClose>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus aria-hidden="true" />}{pending ? "Создаём…" : "Создать курс"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
