"use client";

import { useState } from "react";
import { Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminN8nAccess } from "@/server/tools/student-access";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("CSRF_UNAVAILABLE");
  return body.csrfToken;
}

export function StudentN8nAccessControl({
  studentId,
  access,
  licenseGate,
  expiryDates,
}: {
  studentId: string;
  access: AdminN8nAccess | null;
  licenseGate: { ready: boolean; reason?: string };
  expiryDates: { minimum: string; recommended: string; maximum: string };
}) {
  const router = useRouter();
  const active = access?.status === "active";
  const [expiresOn, setExpiresOn] = useState(
    access?.expiresAt?.slice(0, 10) ?? expiryDates.recommended,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function update(granted: boolean) {
    if (!access) return;
    setPending(true);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch(
        `/api/admin/tools/n8n/access/${studentId}`,
        {
          method: "PUT",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf,
          },
          body: JSON.stringify({
            environmentId: access.environmentId,
            granted,
            expiresAt: granted ? `${expiresOn}T23:59:59+03:00` : null,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string };
      } | null;
      if (!response.ok) {
        throw new Error(body?.error?.message ?? "Не удалось изменить доступ.");
      }
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось изменить доступ.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {licenseGate.ready ? (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Подтверждение доступа к n8n добавлено</AlertTitle>
          <AlertDescription>
            При назначении инструмента ссылка на решение сохраняется на сервере.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Доступ к n8n пока закрыт</AlertTitle>
          <AlertDescription>{licenseGate.reason}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border bg-card p-5">
        {access ? (
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_13rem] sm:items-end">
            <div>
              <p className="text-sm font-medium">{access.environmentName}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {access.environmentReady
                  ? "Среда прошла health-check и готова к назначению."
                  : "Сначала завершите установку и health-check основной среды."}
              </p>
              <label
                htmlFor="n8n-access-expires"
                className="mt-4 block text-sm font-medium"
              >
                Доступ до
              </label>
              <Input
                id="n8n-access-expires"
                type="date"
                min={expiryDates.minimum}
                max={expiryDates.maximum}
                value={expiresOn}
                disabled={active || pending}
                onChange={(event) => setExpiresOn(event.target.value)}
                className="mt-2 max-w-60"
              />
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Платформа сама найдёт или пригласит ученика в n8n с тем же
                email. После выбранной даты вход и активная сессия будут
                автоматически заблокированы.
              </p>
            </div>
            <Button
              variant={active ? "outline" : "default"}
              disabled={
                pending ||
                (!active &&
                  (!licenseGate.ready ||
                    !access.environmentReady ||
                    !expiresOn))
              }
              onClick={() => update(!active)}
            >
              {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {active ? "Отозвать доступ" : "Выдать доступ"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm leading-6 text-muted-foreground">
              Сначала создайте и настройте основную среду n8n. После этого
              здесь появится действие «Выдать доступ».
            </p>
            <Button asChild variant="outline">
              <Link href="/admin/tools/n8n">Настроить n8n</Link>
            </Button>
          </div>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
