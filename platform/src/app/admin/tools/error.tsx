"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export default function ToolsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
      <Alert variant="destructive" aria-live="assertive">
        <AlertTriangle aria-hidden="true" />
        <AlertTitle>Не удалось открыть инструменты</AlertTitle>
        <AlertDescription>
          Данные не изменены. Повторите попытку.
        </AlertDescription>
      </Alert>
      <Button onClick={reset} variant="outline" className="mt-4 min-h-11">
        <RotateCcw aria-hidden="true" />
        Повторить
      </Button>
    </section>
  );
}
