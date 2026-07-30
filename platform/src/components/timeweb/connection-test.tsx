"use client";

import { useState } from "react";
import { CheckCircle2, Loader2, RefreshCw, ShieldAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TimewebConnectionCheck } from "@/server/providers/timeweb/contracts";

type CsrfResponse = { csrfToken?: string };

function Result({ result }: { result: TimewebConnectionCheck }) {
  if (!result.ok) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-destructive" />
        <div>
          <p className="font-medium">{result.error.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Код {result.error.code} · correlation {result.error.correlationId}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-lg border border-emerald-600/20 bg-emerald-500/5 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <CheckCircle2 aria-hidden="true" className="size-4 text-emerald-700" />
        <span className="font-medium">
          {result.mode === "fake" ? "Fake connection готов" : "Read-only connection готов"}
        </span>
        <Badge variant="outline">{result.status}</Badge>
      </div>
      <dl className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
        <div>
          <dt>Серверы</dt>
          <dd className="font-mono text-foreground">{result.catalog.servers.length}</dd>
        </div>
        <div>
          <dt>Тарифы / ОС</dt>
          <dd className="font-mono text-foreground">
            {result.catalog.presets.length} / {result.catalog.operatingSystems.length}
          </dd>
        </div>
        <div>
          <dt>Регионы</dt>
          <dd className="font-mono text-foreground">{result.catalog.locations.length}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">
        {new Date(result.checkedAt).toLocaleString("ru-RU")} · raw provider response и token
        не возвращаются.
      </p>
    </div>
  );
}

export function ConnectionTest() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<TimewebConnectionCheck | null>(null);

  async function runCheck() {
    setPending(true);
    try {
      const csrfResponse = await fetch("/api/auth/csrf", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const csrf = (await csrfResponse.json()) as CsrfResponse;
      if (!csrf.csrfToken) throw new Error("CSRF_UNAVAILABLE");

      const response = await fetch("/api/admin/timeweb/connection-test", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "x-csrf-token": csrf.csrfToken,
        },
      });
      setResult((await response.json()) as TimewebConnectionCheck);
    } catch {
      setResult({
        version: "timeweb-read-v2",
        ok: false,
        mode: "timeweb",
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        error: {
          code: "UPSTREAM_UNAVAILABLE",
          message: "Не удалось выполнить безопасную read-only проверку.",
          correlationId: crypto.randomUUID(),
          retryable: true,
        },
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <Button className="min-h-11" disabled={pending} onClick={runCheck} type="button">
        {pending ? (
          <Loader2 aria-hidden="true" className="animate-spin" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {pending ? "Проверяем…" : "Запустить read-only проверку"}
      </Button>
      <div aria-live="polite" aria-busy={pending}>
        {result ? (
          <Result result={result} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Проверка использует только фиксированный список GET endpoint.
          </p>
        )}
      </div>
    </div>
  );
}
