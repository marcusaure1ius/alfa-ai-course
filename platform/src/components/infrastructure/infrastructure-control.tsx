"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, RefreshCw, Server, Trash2 } from "lucide-react";

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
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { TimewebProvisioningPreview } from "@/server/providers/timeweb/provisioning";

type Environment = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  publicIp: string | null;
  monthlyRoubles: number;
};

type EnvironmentResponse = {
  environments: Environment[];
};

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("CSRF_UNAVAILABLE");
  return body.csrfToken;
}

function DeleteEnvironment({
  environment,
  onAccepted,
}: {
  environment: Environment;
  onAccepted(): void;
}) {
  const [confirmationName, setConfirmationName] = useState("");
  const [confirmedLoss, setConfirmedLoss] = useState(false);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pending, setPending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const exact = confirmationName === environment.name && confirmedLoss;

  async function remove() {
    if (!exact) return;
    setPending(true);
    setDeleteError(null);
    try {
      const csrf = await csrfToken();
      const reauth = await fetch("/api/auth/reauth", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          password,
          ...(mfaCode ? { mfaCode } : {}),
        }),
      });
      if (!reauth.ok) throw new Error("Пароль или второй фактор не подтверждены.");
      const response = await fetch(
        `/api/admin/infrastructure/environments/${environment.id}`,
        {
          method: "DELETE",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf,
          },
          body: JSON.stringify({
            confirmationName,
            idempotencyKey: `delete-${environment.id}-${crypto.randomUUID()}`,
          }),
        },
      );
      if (!response.ok) throw new Error("Cleanup operation отклонена.");
      onAccepted();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Cleanup operation отклонена.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm">
          <Trash2 aria-hidden="true" />
          Удалить
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Удалить «{environment.name}»?</AlertDialogTitle>
          <AlertDialogDescription>
            VPS и принадлежащий ему публичный IP будут удалены автоматически.
            Данные на сервере восстановить нельзя. Действие требует MFA и свежую
            re-auth не старше 10 минут.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <label className="grid gap-1.5 text-sm">
            Введите точное имя среды
            <Input
              value={confirmationName}
              onChange={(event) => setConfirmationName(event.target.value)}
              autoComplete="off"
            />
          </label>
          {deleteError ? (
            <p className="text-sm text-destructive" aria-live="polite">
              {deleteError}
            </p>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmedLoss}
              onChange={(event) => setConfirmedLoss(event.target.checked)}
              className="mt-1"
            />
            Я подтверждаю безвозвратную потерю данных.
          </label>
          <label className="grid gap-1.5 text-sm">
            Пароль для свежей re-auth
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Код authenticator
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(event) =>
                setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="Обязателен в production"
            />
          </label>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={!exact || password.length < 12 || pending}
            onClick={(event) => {
              event.preventDefault();
              void remove();
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            Удалить VPS и IP
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function InfrastructureControl() {
  const [preview, setPreview] = useState<TimewebProvisioningPreview | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [name, setName] = useState("Timeweb smoke");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [previewResponse, environmentsResponse] = await Promise.all([
      fetch("/api/admin/infrastructure/preview", {
        cache: "no-store",
        credentials: "same-origin",
      }),
      fetch("/api/admin/infrastructure/environments", {
        cache: "no-store",
        credentials: "same-origin",
      }),
    ]);
    setPreview((await previewResponse.json()) as TimewebProvisioningPreview);
    const data = (await environmentsResponse.json()) as EnvironmentResponse;
    setEnvironments(data.environments ?? []);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function create() {
    if (!preview?.ok || name.trim().length < 2) return;
    setPending(true);
    setMessage(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch("/api/admin/infrastructure/environments", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          name: name.trim(),
          idempotencyKey: `create-${crypto.randomUUID()}`,
        }),
      });
      const body = (await response.json()) as {
        operationId?: string;
        error?: { message?: string };
      };
      if (!response.ok) throw new Error(body.error?.message ?? "Mutation отклонена.");
      setMessage(`Операция ${body.operationId} принята durable Workflow.`);
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Mutation отклонена.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
            Timeweb lifecycle · slice 1A
          </p>
          <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">Учебная инфраструктура</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Один VPS, один IPv4, server-only adapter и обязательный automatic cleanup.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh()}>
          <RefreshCw aria-hidden="true" />
          Обновить
        </Button>
      </div>

      {preview?.ok ? (
        <Card>
          <CardHeader>
            <CardTitle>Актуальный provider preview</CardTitle>
            <CardDescription>
              IDs и стоимость получены из Timeweb API {new Date(preview.plan.checkedAt).toLocaleString("ru-RU")}.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><p className="text-xs text-muted-foreground">ОС</p><p>{preview.plan.operatingSystemLabel}</p></div>
            <div>
              <p className="text-xs text-muted-foreground">Preset / зона</p>
              <p>{preview.plan.cpu} vCPU · {Math.round(preview.plan.ramMb / 1024)} GB · {Math.round(preview.plan.diskMb / 1024)} GB {preview.plan.diskType}</p>
              <p className="text-xs text-muted-foreground">{preview.plan.region} / {preview.plan.availabilityZone}</p>
            </div>
            <div><p className="text-xs text-muted-foreground">VPS + IPv4</p><p>{preview.plan.monthlyTotalRoubles.toLocaleString("ru-RU")} ₽/мес.</p></div>
            <div><p className="text-xs text-muted-foreground">Баланс</p><p>{preview.plan.balanceRoubles.toLocaleString("ru-RU")} ₽</p></div>
          </CardContent>
        </Card>
      ) : preview ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Платные mutation заблокированы</AlertTitle>
          <AlertDescription>{preview.message}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Создать disposable VPS</CardTitle>
          <CardDescription>Hard limit: одна активная или создаваемая среда.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            aria-label="Имя среды"
          />
          <Button
            disabled={!preview?.ok || environments.some((item) => item.status !== "deleted") || pending}
            onClick={() => void create()}
          >
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Plus aria-hidden="true" />}
            Создать
          </Button>
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-live="polite">
        {message ? <p className="text-sm">{message}</p> : null}
        {environments.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
              <Server aria-hidden="true" />
              Сред пока нет.
            </CardContent>
          </Card>
        ) : (
          environments.map((environment) => (
            <Card key={environment.id}>
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{environment.name}</p>
                    <Badge variant="outline">{environment.status}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {environment.publicIp ?? "IP ещё не назначен"} · {environment.monthlyRoubles.toLocaleString("ru-RU")} ₽/мес.
                  </p>
                </div>
                {["active", "degraded", "cleanup_required"].includes(environment.status) ? (
                  <DeleteEnvironment environment={environment} onAccepted={() => void refresh()} />
                ) : null}
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
