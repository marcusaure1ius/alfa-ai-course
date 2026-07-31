"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("Не удалось подготовить защищённый запрос.");
  return body.csrfToken;
}

export function CourseCreateForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setPending(true);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch("/api/admin/courses", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          title: String(formData.get("title") ?? ""),
          slug: String(formData.get("slug") ?? ""),
          description: String(formData.get("description") ?? ""),
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Не удалось создать курс.");
      }
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось создать курс.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={submit} className="mt-8 max-w-2xl rounded-xl border bg-card p-6">
      <h2 className="font-display text-xl">Создать курс</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Курс создаётся черновиком. После этого его можно назначить ученику.
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="course-title">
            Название
          </label>
          <Input id="course-title" name="title" minLength={2} maxLength={120} required />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="course-slug">
            Slug
          </label>
          <Input
            id="course-slug"
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="n8n-start"
            required
          />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <label className="text-sm font-medium" htmlFor="course-description">
          Описание
        </label>
        <Input id="course-description" name="description" maxLength={500} />
      </div>
      <Button className="mt-5" disabled={pending} type="submit">
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
        Создать курс
      </Button>
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
