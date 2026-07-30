"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
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

export function MaterialEditor({ material }: { material: AdminMaterialItem }) {
  const router = useRouter();
  const [title, setTitle] = useState(material.title);
  const [summary, setSummary] = useState(material.summary);
  const [bodyMarkdown, setBodyMarkdown] = useState(material.bodyMarkdown);
  const [status, setStatus] = useState(material.status);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
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
          title,
          summary,
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
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось сохранить.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="space-y-6">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Название</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Короткое описание</span>
          <Input
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Текст Markdown</span>
          <textarea
            value={bodyMarkdown}
            onChange={(event) => setBodyMarkdown(event.target.value)}
            className="min-h-[32rem] w-full resize-y rounded-lg border bg-background px-4 py-3 font-mono text-sm leading-6 outline-none transition-shadow focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/35"
          />
        </label>
      </div>

      <aside className="self-start rounded-xl border bg-card p-5 xl:sticky xl:top-24">
        <label className="block">
          <span className="mb-2 block text-sm font-medium">Состояние</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as "draft" | "published")
            }
            className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
          >
            <option value="draft">Черновик</option>
            <option value="published">Опубликован</option>
          </select>
        </label>
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
        <Button className="mt-7 w-full" onClick={save} disabled={pending}>
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : saved ? (
            <Check aria-hidden="true" />
          ) : null}
          {pending ? "Сохраняем…" : saved ? "Сохранено" : "Сохранить"}
        </Button>
        {error ? (
          <p role="alert" className="mt-3 text-sm leading-5 text-destructive">
            {error}
          </p>
        ) : null}
      </aside>
    </div>
  );
}
