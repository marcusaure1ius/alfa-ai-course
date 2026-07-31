"use client";

import { useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
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

export function StudentCreateForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch("/api/admin/students", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ email, password }),
      });
      const body = (await response.json().catch(() => null)) as
        | { studentId?: string; error?: { message?: string } }
        | null;
      if (!response.ok || !body?.studentId) {
        throw new Error(body?.error?.message ?? "Не удалось создать ученика.");
      }
      router.push(`/admin/students/${body.studentId}`);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось создать ученика.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-8 grid gap-4 rounded-xl border bg-card p-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
    >
      <label className="grid gap-2 text-sm font-medium">
        Email ученика
        <Input
          type="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
          disabled={pending}
        />
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Временный пароль
        <Input
          type="password"
          autoComplete="new-password"
          minLength={12}
          maxLength={128}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={pending}
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}
        Добавить
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive sm:col-span-3">
          {error}
        </p>
      ) : null}
      <p className="text-xs leading-5 text-muted-foreground sm:col-span-3">
        Передайте временный пароль ученику безопасным каналом. Он не показывается
        повторно и не попадает в журнал действий.
      </p>
    </form>
  );
}
