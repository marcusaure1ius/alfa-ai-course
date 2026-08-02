"use client";

import { Bookmark } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

const MAX_POSITION_LENGTH = 160;

export function normalizeReadingPosition(value: string | null): string | null {
  const position = value?.trim() ?? "";
  if (
    !position ||
    position.length > MAX_POSITION_LENGTH ||
    !/^[\p{L}\p{N}][\p{L}\p{N}-]*$/u.test(position)
  ) {
    return null;
  }
  return position;
}

export function MaterialReadingProgress({
  materialId,
  initialPosition,
  completed,
}: {
  materialId: string;
  initialPosition: string | null;
  completed: boolean;
}) {
  const normalizedInitial = normalizeReadingPosition(initialPosition);
  const lastSavedRef = useRef<string | null>(normalizedInitial);
  const [resumePosition, setResumePosition] = useState<string | null>(
    normalizedInitial,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: number | null = null;
    let disposed = false;

    async function persist(position: string) {
      try {
        const csrfResponse = await fetch("/api/auth/csrf", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const csrf = (await csrfResponse.json()) as { csrfToken?: string };
        if (!csrf.csrfToken) throw new Error("CSRF");
        const response = await fetch(
          `/api/student/materials/${materialId}/progress`,
          {
            method: "PUT",
            credentials: "same-origin",
            headers: {
              "content-type": "application/json",
              "x-csrf-token": csrf.csrfToken,
            },
            body: JSON.stringify({
              lastPosition: position,
              completed,
            }),
          },
        );
        if (!response.ok) throw new Error("UPDATE_FAILED");
        if (!disposed) {
          lastSavedRef.current = position;
          setSaveError(null);
        }
      } catch {
        if (!disposed) {
          setSaveError(
            "Не удалось сохранить место чтения. Материал остаётся доступен.",
          );
        }
      }
    }

    function scheduleSave() {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        const headings = Array.from(
          document.querySelectorAll<HTMLElement>("[data-reading-anchor]"),
        );
        const position = headings
          .filter((heading) => heading.getBoundingClientRect().top <= 176)
          .at(-1)?.id;
        const normalized = normalizeReadingPosition(position ?? null);
        if (!normalized || normalized === lastSavedRef.current) return;
        void persist(normalized);
      }, 700);
    }

    window.addEventListener("scroll", scheduleSave, { passive: true });
    return () => {
      disposed = true;
      window.removeEventListener("scroll", scheduleSave);
      if (timeoutId !== null) window.clearTimeout(timeoutId);
    };
  }, [completed, materialId]);

  if (!resumePosition && !saveError) return null;

  return (
    <div className="mb-6 max-w-3xl">
      {resumePosition ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm leading-6 text-muted-foreground">
            <Bookmark className="size-4 shrink-0" aria-hidden="true" />
            Сохранено место чтения в этом материале.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => {
              const target = document.getElementById(resumePosition);
              if (!target) {
                setResumePosition(null);
                return;
              }
              window.history.replaceState(
                null,
                "",
                `#${encodeURIComponent(resumePosition)}`,
              );
              target.scrollIntoView({ block: "start" });
              target.focus({ preventScroll: true });
              setResumePosition(null);
            }}
          >
            Вернуться к месту
          </Button>
        </div>
      ) : null}
      {saveError ? (
        <p
          className="mt-3 text-sm leading-6 text-destructive"
          role="status"
          aria-live="polite"
        >
          {saveError}
        </p>
      ) : null}
    </div>
  );
}
