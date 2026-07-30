"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  HardDrive,
  Loader2,
  MapPin,
  Plus,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";

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
import type { CloudProvisioningPreview } from "@/server/providers/provisioning";
import type { TimewebDeploySelection } from "@/server/providers/timeweb/provisioning";

type Environment = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  publicIp: string | null;
  monthlyRoubles: number;
  ownedResources: Array<{
    kind: string;
    providerResourceId: string;
    status: string;
    monthlyRoubles: number;
  }>;
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

const statusLabels: Record<string, string> = {
  creating: "Создаётся",
  active: "Работает",
  degraded: "Нужна проверка",
  deleting: "Удаляется",
  cleanup_required: "Нужно завершить удаление",
  deleted: "Удалён",
};

const resourceLabels: Record<string, string> = {
  server: "Сервер",
  public_ip: "Публичный IP",
  backup: "Резервные копии",
};

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
      if (!reauth.ok) throw new Error("Не удалось подтвердить вход.");
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
            confirmedLoss,
            idempotencyKey: `delete-${environment.id}-${crypto.randomUUID()}`,
          }),
        },
      );
      if (!response.ok) throw new Error("Не удалось удалить сервер.");
      onAccepted();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Не удалось удалить сервер.",
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
            Данные на сервере восстановить нельзя. Для подтверждения введите
            пароль от кабинета.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <p className="font-medium">Будут удалены</p>
            {environment.ownedResources.length > 0 ? (
              <ul className="mt-2 space-y-1">
                {environment.ownedResources.map((resource) => (
                  <li
                    key={`${resource.kind}:${resource.providerResourceId}`}
                    className="text-xs"
                  >
                    {resourceLabels[resource.kind] ?? "Связанный ресурс"} ·{" "}
                    {resource.monthlyRoubles} ₽/мес.
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">
                Активные ресурсы не найдены.
              </p>
            )}
            <p className="mt-2 text-destructive">
              Сервер, его диски и резервные копии будут удалены безвозвратно.
            </p>
          </div>
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
            Пароль от кабинета
            <Input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <label className="grid gap-1.5 text-sm">
            Код из приложения (если включён)
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              value={mfaCode}
              onChange={(event) =>
                setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              placeholder="000000"
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
  const [preview, setPreview] = useState<CloudProvisioningPreview | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selection, setSelection] = useState<TimewebDeploySelection | null>(null);
  const [name, setName] = useState("Учебный сервер");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async (selected = selection) => {
    const query = selected
      ? new URLSearchParams({
          region: selected.region,
          presetId: String(selected.presetId),
          operatingSystemId: String(selected.operatingSystemId),
          backupsEnabled: String(selected.backupsEnabled),
        })
      : null;
    const [previewResponse, environmentsResponse] = await Promise.all([
      fetch(
        `/api/admin/infrastructure/preview${query ? `?${query}` : ""}`,
        {
          cache: "no-store",
          credentials: "same-origin",
        },
      ),
      fetch("/api/admin/infrastructure/environments", {
        cache: "no-store",
        credentials: "same-origin",
      }),
    ]);
    const nextPreview =
      (await previewResponse.json()) as CloudProvisioningPreview;
    setPreview(nextPreview);
    if (nextPreview.ok) {
      setSelection((current) => current ?? nextPreview.catalog.defaultSelection);
    }
    const data = (await environmentsResponse.json()) as EnvironmentResponse;
    setEnvironments(data.environments ?? []);
  }, [selection]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), selection ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [refresh, selection]);

  async function create() {
    if (!preview?.ok || !selection || name.trim().length < 2) return;
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
          deployment: selection,
        }),
      });
      const body = (await response.json()) as {
        operationId?: string;
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Не удалось создать сервер.");
      }
      setMessage("Сервер поставлен в очередь на создание.");
      await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Не удалось создать сервер.",
      );
    } finally {
      setPending(false);
    }
  }

  const catalog = preview?.ok ? preview.catalog : null;
  const selectedRegion = catalog?.regions.find(
    (region) => region.id === selection?.region,
  );
  const activeEnvironment = environments.some(
    (item) => item.status !== "deleted",
  );

  return (
    <main className="page-container space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-page-title">Инструменты</h1>
          <p className="mt-2 text-sm text-muted-foreground">n8n</p>
        </div>
        <Button variant="outline" onClick={() => void refresh(selection)}>
          <RefreshCw aria-hidden="true" />
          Обновить конфигурации
        </Button>
      </div>

      {preview?.ok ? (
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-[#111923] text-slate-50 shadow-xl shadow-slate-950/10">
          <div className="border-b border-slate-800 px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.16em] text-violet-300">
                  Premium NVMe
                </p>
                <h2 className="mt-2 text-xl font-semibold">
                  Конфигурация сервера
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  Цены обновлены{" "}
                  {new Date(preview.catalog.checkedAt).toLocaleString("ru-RU")}.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="size-4" aria-hidden="true" />
                    Регион
                  </span>
                  <select
                    value={selection?.region ?? ""}
                    onChange={(event) => {
                      const region = preview.catalog.regions.find(
                        (candidate) => candidate.id === event.target.value,
                      );
                      if (!region || !selection) return;
                      const recommended =
                        region.presets.find(
                          (preset) =>
                            preset.cpu === 2 &&
                            preset.ramMb === 4_096 &&
                            preset.diskMb === 51_200,
                        ) ?? region.presets[0]!;
                      setSelection({
                        ...selection,
                        region: region.id,
                        presetId: recommended.id,
                      });
                    }}
                    className="h-10 min-w-48 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    aria-label="Регион сервера"
                  >
                    {preview.catalog.regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.label} · {region.availabilityZone}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm text-slate-300">
                  Образ
                  <select
                    value={selection?.operatingSystemId ?? ""}
                    onChange={(event) =>
                      selection &&
                      setSelection({
                        ...selection,
                        operatingSystemId: Number(event.target.value),
                      })
                    }
                    className="h-10 min-w-48 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
                    aria-label="Образ операционной системы"
                  >
                    {preview.catalog.operatingSystems.map((operatingSystem) => (
                      <option key={operatingSystem.id} value={operatingSystem.id}>
                        {operatingSystem.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-3 p-3 sm:p-5">
            <div className="hidden grid-cols-[1.1fr_0.8fr_0.9fr_0.9fr_1.2fr] gap-4 px-5 text-xs text-slate-400 sm:grid">
              <span>CPU</span>
              <span>RAM</span>
              <span>NVMe</span>
              <span>Канал</span>
              <span>Стоимость</span>
            </div>
            {selectedRegion?.presets.map((preset) => {
              const selected = preset.id === selection?.presetId;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() =>
                    selection &&
                    setSelection({ ...selection, presetId: preset.id })
                  }
                  aria-pressed={selected}
                  className={`relative grid w-full grid-cols-2 gap-x-4 gap-y-3 rounded-xl border p-4 text-left transition sm:grid-cols-[1.1fr_0.8fr_0.9fr_0.9fr_1.2fr] sm:items-center sm:px-5 ${
                    selected
                      ? "border-violet-400 bg-slate-800 ring-1 ring-violet-400"
                      : "border-transparent bg-slate-800/80 hover:border-slate-600 hover:bg-slate-800"
                  } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300`}
                >
                  {selected ? (
                    <span className="absolute -top-2 left-3 flex items-center gap-1 rounded-full bg-violet-700 px-2 py-0.5 text-[10px] font-semibold text-white">
                      <Check className="size-3" aria-hidden="true" />
                      Выбрано
                    </span>
                  ) : null}
                  <span>
                    <span className="block text-[11px] text-slate-300 sm:hidden">
                      CPU
                    </span>
                    <span className="font-semibold">{preset.cpu} vCPU</span>
                  </span>
                  <span>
                    <span className="block text-[11px] text-slate-300 sm:hidden">
                      RAM
                    </span>
                    <span className="font-semibold">
                      {preset.ramMb / 1_024} ГБ
                    </span>
                  </span>
                  <span>
                    <span className="block text-[11px] text-slate-300 sm:hidden">
                      NVMe
                    </span>
                    <span className="font-semibold">
                      {preset.diskMb / 1_024} ГБ
                    </span>
                  </span>
                  <span>
                    <span className="block text-[11px] text-slate-300 sm:hidden">
                      Канал
                    </span>
                    <span className="font-semibold">
                      {preset.bandwidthMbps === 1_000
                        ? "1 Гбит/с"
                        : `${preset.bandwidthMbps} Мбит/с`}
                    </span>
                  </span>
                  <span className="col-span-2 flex items-baseline justify-between gap-2 border-t border-slate-700/70 pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0">
                    <span className="font-semibold">
                      {preset.monthlyRoubles.toLocaleString("ru-RU")} ₽/мес
                    </span>
                    <span className="text-sm text-slate-300 sm:mt-0.5 sm:block">
                      {preset.hourlyRoubles.toLocaleString("ru-RU", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      ₽/час
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-3 border-t border-slate-800 p-4 sm:grid-cols-2 sm:p-6">
            <button
              type="button"
              role="switch"
              aria-checked={selection?.backupsEnabled ?? false}
              onClick={() =>
                selection &&
                setSelection({
                  ...selection,
                  backupsEnabled: !selection.backupsEnabled,
                })
              }
              className="flex items-center justify-between gap-4 rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
            >
              <span className="flex gap-3">
                <HardDrive className="mt-0.5 size-5 text-violet-300" aria-hidden="true" />
                <span>
                  <span className="block font-medium">Автобэкапы</span>
                  <span className="mt-0.5 block text-xs text-slate-400">
                    Раз в неделю, хранить 1 копию · 6 ₽/ГБ за копию
                  </span>
                </span>
              </span>
              <span
                className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
                  selection?.backupsEnabled ? "bg-violet-500" : "bg-slate-700"
                }`}
                aria-hidden="true"
              >
                <span
                  className={`size-5 rounded-full bg-white transition ${
                    selection?.backupsEnabled ? "translate-x-5" : ""
                  }`}
                />
              </span>
            </button>
            <div className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/70 p-4">
              <ShieldCheck className="size-5 text-emerald-400" aria-hidden="true" />
              <div>
                <p className="font-medium">Публичный IPv4 включён</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Создаётся и привязывается сразу ·{" "}
                  {preview.catalog.publicIpv4.monthlyRoubles.toLocaleString("ru-RU")}{" "}
                  ₽/мес
                </p>
              </div>
            </div>
          </div>
        </section>
      ) : preview ? (
        <Alert variant="destructive">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Не удалось загрузить конфигурации</AlertTitle>
          <AlertDescription>
            {preview.message}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Проверить и создать</CardTitle>
          <CardDescription>
            Сейчас платформа создаёт сам сервер с Ubuntu и публичным IP.
            Установка n8n пока запускается отдельно после создания.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="grid gap-1.5 text-sm">
            Имя сервера
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              aria-label="Имя сервера"
            />
          </label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {preview?.ok ? (
              <div className="mr-2">
                <p className="text-xs text-muted-foreground">VPS + IPv4</p>
                <p className="text-lg font-semibold">
                  {preview.plan.monthlyTotalRoubles.toLocaleString("ru-RU")} ₽/мес
                </p>
              </div>
            ) : null}
            <Button
              size="lg"
              disabled={!preview?.ok || !selection || activeEnvironment || pending}
              onClick={() => void create()}
            >
              {pending ? (
                <Loader2 aria-hidden="true" className="animate-spin" />
              ) : (
                <Plus aria-hidden="true" />
              )}
              Создать сервер
            </Button>
          </div>
          {activeEnvironment ? (
            <p className="text-sm text-muted-foreground lg:col-span-2">
              Сначала удалите активный сервер: сейчас доступен один сервер.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-live="polite">
        {message ? <p className="text-sm">{message}</p> : null}
        {environments.length === 0 ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-8 text-muted-foreground">
              <Server aria-hidden="true" />
              n8n пока не подключён. Выберите конфигурацию и создайте среду.
            </CardContent>
          </Card>
        ) : (
          environments.map((environment) => (
            <Card key={environment.id}>
              <CardContent className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{environment.name}</p>
                    <Badge variant="outline">
                      {statusLabels[environment.status] ?? "Обновляется"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {environment.publicIp ?? "IP ещё не назначен"} · {environment.monthlyRoubles.toLocaleString("ru-RU")} ₽/мес.
                  </p>
                  {environment.status === "cleanup_required" ? (
                    <ul className="mt-2 space-y-1 text-xs text-destructive">
                      {environment.ownedResources.map((resource) => (
                        <li key={`${resource.kind}:${resource.providerResourceId}`}>
                          Остался {resourceLabels[resource.kind] ?? "ресурс"} (
                          {resource.monthlyRoubles} ₽/мес.). Повторите удаление.
                        </li>
                      ))}
                    </ul>
                  ) : null}
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
