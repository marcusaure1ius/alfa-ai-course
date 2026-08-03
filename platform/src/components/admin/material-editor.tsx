"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { AdminMaterialItem } from "@/server/admin/workspace";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("CSRF_UNAVAILABLE");
  return body.csrfToken;
}

type EditorSnapshot = {
  title: string;
  summary: string;
  bodyMarkdown: string;
  status: "draft" | "published";
};

export function MaterialEditor({ material }: { material: AdminMaterialItem }) {
  const router = useRouter();
  const [title, setTitle] = useState(material.title);
  const [summary, setSummary] = useState(material.summary);
  const [bodyMarkdown, setBodyMarkdown] = useState(material.bodyMarkdown);
  const [status, setStatus] = useState(material.status);
  const [savedSnapshot, setSavedSnapshot] = useState<EditorSnapshot>({
    title: material.title,
    summary: material.summary,
    bodyMarkdown: material.bodyMarkdown,
    status: material.status,
  });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titleError, setTitleError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  const dirty =
    title !== savedSnapshot.title ||
    summary !== savedSnapshot.summary ||
    bodyMarkdown !== savedSnapshot.bodyMarkdown ||
    status !== savedSnapshot.status;

  useEffect(() => {
    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirty) return;
      event.preventDefault();
    }
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [dirty]);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextTitleError =
      title.trim().length < 2 ? "Введите название материала." : null;
    setTitleError(nextTitleError);
    if (nextTitleError) {
      titleRef.current?.focus();
      return;
    }

    setPending(true);
    setSaved(false);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/admin/materials/${material.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          sectionId: material.sectionId,
          slug: material.slug,
          kind: material.kind,
          title: title.trim(),
          summary: summary.trim(),
          bodyMarkdown,
          position: material.position,
          estimatedMinutes: material.estimatedMinutes,
          status,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Не удалось сохранить материал.");
      }
      setTitle(title.trim());
      setSummary(summary.trim());
      setSavedSnapshot({
        title: title.trim(),
        summary: summary.trim(),
        bodyMarkdown,
        status,
      });
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось сохранить.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]"
      onSubmit={save}
      noValidate
    >
      <div className="space-y-6">
        <Field>
          <FieldLabel htmlFor="editor-title">Название</FieldLabel>
          <Input
            ref={titleRef}
            id="editor-title"
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              setTitleError(null);
              setSaved(false);
            }}
            maxLength={160}
            aria-invalid={Boolean(titleError)}
            aria-describedby={titleError ? "editor-title-error" : undefined}
          />
          {titleError ? (
            <FieldError id="editor-title-error">{titleError}</FieldError>
          ) : null}
        </Field>

        <Field>
          <FieldLabel htmlFor="editor-summary">Короткое описание</FieldLabel>
          <Input
            id="editor-summary"
            value={summary}
            onChange={(event) => {
              setSummary(event.target.value);
              setSaved(false);
            }}
            maxLength={500}
            aria-describedby="editor-summary-help"
          />
          <FieldDescription id="editor-summary-help">
            До 500 символов — этот текст помогает ученику понять цель шага.
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="editor-body">Текст Markdown</FieldLabel>
          <textarea
            id="editor-body"
            value={bodyMarkdown}
            onChange={(event) => {
              setBodyMarkdown(event.target.value);
              setSaved(false);
            }}
            className="min-h-[32rem] w-full resize-y rounded-lg border bg-background px-4 py-3 font-mono text-sm leading-6 outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35"
            aria-describedby="editor-body-help"
          />
          <FieldDescription id="editor-body-help">
            Опасный HTML и неподдерживаемые ссылки будут отклонены сервером.
          </FieldDescription>
        </Field>
      </div>

      <aside className="self-start rounded-xl border bg-card p-5 xl:sticky xl:top-24">
        <Field>
          <FieldLabel htmlFor="editor-status">Состояние</FieldLabel>
          <select
            id="editor-status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as "draft" | "published");
              setSaved(false);
            }}
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35"
          >
            <option value="draft">Черновик</option>
            <option value="published">Виден ученикам</option>
          </select>
        </Field>
        <dl className="mt-6 space-y-4 text-sm">
          <div>
            <dt className="text-muted-foreground">Раздел</dt>
            <dd className="mt-1">{material.sectionTitle}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Версия</dt>
            <dd className="mt-1 tabular-nums">{material.version}</dd>
          </div>
        </dl>
        <p
          className="mt-6 text-sm leading-5 text-muted-foreground"
          aria-live="polite"
        >
          {dirty
            ? "Есть несохранённые изменения."
            : saved
              ? "Все изменения сохранены."
              : "Изменений пока нет."}
        </p>
        <Button
          className="mt-4 w-full"
          type="submit"
          disabled={pending || !dirty}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : saved ? (
            <Check aria-hidden="true" />
          ) : null}
          {pending ? "Сохраняем…" : saved ? "Сохранено" : "Сохранить"}
        </Button>
        {error ? (
          <FieldError className="mt-3" aria-live="polite">
            {error}
          </FieldError>
        ) : null}
      </aside>
    </form>
  );
}
