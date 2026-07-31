"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function CompleteMaterialButton({
  materialId,
  completed,
}: {
  materialId: string;
  completed: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateProgress() {
    setPending(true);
    setError(null);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const csrf = (await csrfResponse.json()) as { csrfToken?: string };
      if (!csrf.csrfToken) throw new Error("CSRF");
      const response = await fetch(`/api/student/materials/${materialId}/progress`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf.csrfToken,
        },
        body: JSON.stringify({ lastPosition: null, completed: !completed }),
      });
      if (!response.ok) throw new Error("UPDATE_FAILED");
      router.refresh();
    } catch {
      setError("Не удалось сохранить. Попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        type="button"
        variant={completed ? "outline" : "default"}
        onClick={() => void updateProgress()}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Check aria-hidden="true" />
        )}
        {completed ? "Отметить непройденным" : "Завершить материал"}
      </Button>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
