"use client";

import { LockKeyhole, LockKeyholeOpen, LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Не удалось подготовить защищённый запрос.");
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("Не удалось подготовить защищённый запрос.");
  return body.csrfToken;
}

function assignmentCountLabel(count: number): string {
  const mod100 = count % 100;
  const mod10 = count % 10;
  const noun =
    mod100 >= 11 && mod100 <= 19
      ? "активных назначений"
      : mod10 === 1
        ? "активного назначения"
        : mod10 >= 2 && mod10 <= 4
          ? "активных назначений"
          : "активных назначений";
  return `${count} ${noun}`;
}

export function ToolAccessGate({
  toolType,
  displayName,
  enabled,
  activeAccessCount,
}: {
  toolType: string;
  displayName: string;
  enabled: boolean;
  activeAccessCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(nextEnabled: boolean) {
    setPending(true);
    setError(null);
    try {
      const csrfToken = await getCsrfToken();
      const response = await fetch(`/api/admin/tools/${toolType}/access-gate`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "content-type": "application/json", "x-csrf-token": csrfToken },
        body: JSON.stringify({ enabled: nextEnabled }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        throw new Error(body?.error?.message ?? "Не удалось изменить доступ.");
      }
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось изменить доступ.");
    } finally {
      setPending(false);
    }
  }

  if (!enabled) {
    return (
      <div>
        <Button className="min-h-11" variant="outline" size="sm" disabled={pending} onClick={() => update(true)}>
          {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <LockKeyholeOpen aria-hidden="true" />}
          Открыть доступ
        </Button>
        {error ? <p className="mt-2 max-w-sm text-sm text-destructive" role="alert">{error}</p> : null}
      </div>
    );
  }

  if (activeAccessCount === 0) return null;
  return (
    <div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button className="min-h-11" variant="outline" size="sm" disabled={pending}>
            <LockKeyhole aria-hidden="true" />
            Закрыть доступ всем
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Закрыть ученикам доступ к {displayName}?</AlertDialogTitle>
            <AlertDialogDescription>
              Рабочие ссылки сразу станут недоступны для {assignmentCountLabel(activeAccessCount)}.
              Назначения и среда сохранятся, поэтому доступ можно будет вернуть одной кнопкой.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
            <AlertDialogAction disabled={pending} onClick={() => update(false)}>
              {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
              Закрыть доступ
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {error ? <p className="mt-2 max-w-sm text-sm text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
