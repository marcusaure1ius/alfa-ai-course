"use client";

import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import type { StudentN8nAccessState } from "@/server/tools/student-access";

const REQUEST_TIMEOUT_MS = 6_000;
const POLL_INTERVAL_MS = 8_000;
const MAX_AUTO_CHECKS = 3;

type AccessPayload = { tool?: { state?: StudentN8nAccessState } };

export function N8nAccessRefresh({
  state,
  auto = false,
}: {
  state: StudentN8nAccessState;
  auto?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const mounted = useRef(true);
  const pendingRef = useRef(false);
  const activeRequest = useRef<AbortController | null>(null);

  const check = useCallback(
    async (announce = true): Promise<boolean> => {
      if (pendingRef.current || document.visibilityState === "hidden" || !navigator.onLine) {
        if (announce) {
          setStatus(
            !navigator.onLine
              ? "Нет соединения. Проверьте интернет и повторите."
              : "Проверка продолжится, когда вкладка снова станет активной.",
          );
        }
        return false;
      }
      const controller = new AbortController();
      activeRequest.current?.abort();
      activeRequest.current = controller;
      const timeout = window.setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );
      pendingRef.current = true;
      setPending(true);
      if (announce) setStatus(null);
      try {
        const response = await fetch("/api/student/tools/n8n", {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("request_failed");
        const payload = (await response.json()) as AccessPayload;
        if (mounted.current) {
          const nextState = payload.tool?.state;
          if (nextState && nextState !== state) {
            setStatus("Состояние изменилось. Обновляем экран…");
            router.refresh();
          } else if (announce) {
            setStatus("Проверили: состояние пока не изменилось.");
          }
        }
      } catch (error) {
        if (mounted.current) {
          setStatus(
            error instanceof DOMException && error.name === "AbortError"
              ? "Проверка заняла слишком много времени. Повторите ещё раз."
              : "Не удалось проверить состояние. Повторите ещё раз.",
          );
        }
      } finally {
        window.clearTimeout(timeout);
        pendingRef.current = false;
        if (mounted.current) setPending(false);
      }
      return true;
    },
    [router, state],
  );

  useEffect(() => {
    mounted.current = true;
    if (!auto) {
      return () => {
        mounted.current = false;
        activeRequest.current?.abort();
      };
    }
    let checks = 0;
    const timer = window.setInterval(async () => {
      const started = await check(false);
      if (!started) return;
      checks += 1;
      if (checks >= MAX_AUTO_CHECKS) window.clearInterval(timer);
    }, POLL_INTERVAL_MS);
    return () => {
      mounted.current = false;
      activeRequest.current?.abort();
      window.clearInterval(timer);
    };
  }, [auto, check]);

  return (
    <div className="min-w-0">
      <Button type="button" onClick={() => void check()} disabled={pending}>
        {pending ? (
          <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : (
          <RefreshCw aria-hidden="true" />
        )}
        {pending ? "Проверяем…" : "Проверить состояние"}
      </Button>
      <p
        className="mt-2 max-w-md text-sm leading-5 text-muted-foreground"
        role="status"
        aria-live="polite"
      >
        {status}
      </p>
    </div>
  );
}
