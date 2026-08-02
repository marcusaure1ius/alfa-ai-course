"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ExternalLink,
  HardDrive,
  Loader2,
  MapPin,
  Plus,
  Download,
  RefreshCw,
  Server,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import Link from "next/link";

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
import { Skeleton } from "@/components/ui/skeleton";
import type { CloudProvisioningPreview } from "@/server/providers/provisioning";
import type { TimewebDeploySelection } from "@/server/providers/timeweb/provisioning";

type Environment = {
  id: string;
  name: string;
  status: string;
  updatedAt: string;
  publicUrl: string | null;
  installationStatus: string | null;
  currentOperation: {
    id: string;
    kind: string;
    status: string;
    currentStep: string | null;
    canResume: boolean;
  } | null;
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

function apiErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) return fallback;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  if (error && typeof error === "object" && !Array.isArray(error)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
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

const operationStepLabels: Record<string, string> = {
  configure_dns: "Настраиваем DNS",
  waiting_dns: "Ждём DNS",
  installing_n8n: "Переустанавливаем Ubuntu и n8n",
  provider_installing: "Проверяем сервер после переустановки",
  bootstrapping: "Запускаем сервисы",
  issuing_tls: "Получаем TLS-сертификат",
  health_check: "Проверяем n8n",
  complete_install: "Завершаем установку",
};

function operationStepLabel(operation: Environment["currentOperation"]): string {
  if (!operation) return "Операция поставлена в очередь";
  if (
    operation.kind === "create_environment" &&
    operation.currentStep === "provider_installing"
  ) {
    return "Проверяем готовность сервера";
  }
  return (
    operationStepLabels[operation.currentStep ?? ""] ??
    "Операция поставлена в очередь"
  );
}

function InstallEnvironment({
  environment,
  toolType,
  resume = false,
  onAccepted,
}: {
  environment: Environment;
  toolType: string;
  resume?: boolean;
  onAccepted(): void;
}) {
  const [confirmationName, setConfirmationName] = useState("");
  const [confirmedLoss, setConfirmedLoss] = useState(false);
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [pending, setPending] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);
  const exact = confirmationName === environment.name && confirmedLoss;

  async function install() {
    if (!exact) return;
    setPending(true);
    setInstallError(null);
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
        `/api/admin/infrastructure/environments/${environment.id}/install-n8n`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": csrf,
          },
          body: JSON.stringify({
            toolType,
            confirmationName,
            confirmedLoss,
            idempotencyKey: `install-${environment.id}-${crypto.randomUUID()}`,
          }),
        },
      );
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message ?? "Не удалось запустить установку.");
      }
      onAccepted();
    } catch (error) {
      setInstallError(
        error instanceof Error
          ? error.message
          : "Не удалось запустить установку.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" className="min-h-11">
          <Download aria-hidden="true" />
          {resume ? "Возобновить установку" : "Установить n8n"}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {resume
              ? `Возобновить установку на «${environment.name}»?`
              : `Установить n8n на «${environment.name}»?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {resume
              ? "Прерванная durable-операция продолжится с последнего незавершённого шага. Второй VPS или публичный IP создаваться не будет."
              : "Тот же VPS будет полностью переустановлен на Ubuntu 24.04. Публичный IP сохранится, но все текущие файлы и настройки сервера будут удалены. После установки нужно будет создать владельца n8n."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3">
          <Alert variant="destructive">
            <AlertTriangle aria-hidden="true" />
            <AlertTitle>Все данные VPS будут удалены</AlertTitle>
            <AlertDescription>
              Продолжайте только для чистого сервера, созданного этим мастером.
            </AlertDescription>
          </Alert>
          <label className="grid gap-1.5 text-sm">
            Введите точное имя среды
            <Input
              value={confirmationName}
              onChange={(event) => setConfirmationName(event.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={confirmedLoss}
              onChange={(event) => setConfirmedLoss(event.target.checked)}
              className="mt-1"
            />
            Я подтверждаю полную переустановку и потерю данных VPS.
          </label>
          <label className="grid gap-1.5 text-sm">
            Пароль Neurokurs
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
          {installError ? (
            <p className="text-sm text-destructive" aria-live="polite">
              {installError}
            </p>
          ) : null}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Отмена</AlertDialogCancel>
          <AlertDialogAction
            disabled={!exact || password.length < 12 || pending}
            onClick={(event) => {
              event.preventDefault();
              void install();
            }}
          >
            {pending ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
            {resume ? "Продолжить установку" : "Переустановить VPS и n8n"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeleteEnvironment({
  environment,
  toolType,
  onAccepted,
}: {
  environment: Environment;
  toolType: string;
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
            toolType,
            confirmationName,
            confirmedLoss,
            idempotencyKey: `delete-${environment.id}-${crypto.randomUUID()}`,
          }),
        },
      );
      if (!response.ok) throw new Error("Не удалось удалить среду.");
      onAccepted();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "Не удалось удалить среду.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive" size="sm" className="min-h-11">
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
            пароль Neurokurs.
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
            Пароль Neurokurs
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
            Удалить среду и ресурсы
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function InfrastructureControl({ toolType = "n8n" }: { toolType?: string }) {
  const [preview, setPreview] = useState<CloudProvisioningPreview | null>(null);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selection, setSelection] = useState<TimewebDeploySelection | null>(null);
  const [name, setName] = useState("Учебная среда");
  const [pending, setPending] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createCostConfirmed, setCreateCostConfirmed] = useState(false);
  const [createPassword, setCreatePassword] = useState("");
  const [createMfaCode, setCreateMfaCode] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createIdempotencyKey, setCreateIdempotencyKey] = useState<string | null>(
    null,
  );
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async (selected = selection) => {
    setLoadError(null);
    try {
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
        fetch(`/api/admin/infrastructure/environments?toolType=${encodeURIComponent(toolType)}`, {
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
      if (!environmentsResponse.ok) throw new Error("ENVIRONMENTS_UNAVAILABLE");
      const data = (await environmentsResponse.json()) as EnvironmentResponse;
      setEnvironments(data.environments ?? []);
    } catch {
      setLoadError(
        "Не удалось обновить конфигурацию. Проверьте соединение и повторите.",
      );
    } finally {
      setLoaded(true);
    }
  }, [selection, toolType]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), selection ? 180 : 0);
    return () => window.clearTimeout(timer);
  }, [refresh, selection]);

  useEffect(() => {
    const hasRunningOperation = environments.some(
      (environment) =>
        environment.currentOperation ||
        ["creating", "deleting"].includes(environment.status),
    );
    if (!loaded || !hasRunningOperation) return;
    const timer = window.setTimeout(() => void refresh(selection), 1_500);
    return () => window.clearTimeout(timer);
  }, [environments, loaded, refresh, selection]);

  async function create() {
    if (
      !preview?.ok ||
      !selection ||
      name.trim().length < 2 ||
      !createCostConfirmed
    ) {
      return;
    }
    setPending(true);
    setCreateError(null);
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
          password: createPassword,
          ...(createMfaCode ? { mfaCode: createMfaCode } : {}),
        }),
      });
      const reauthBody = await reauth.json().catch(() => null);
      if (!reauth.ok) {
        throw new Error(
          apiErrorMessage(reauthBody, "Не удалось подтвердить вход."),
        );
      }
      const idempotencyKey =
        createIdempotencyKey ?? `create-${crypto.randomUUID()}`;
      setCreateIdempotencyKey(idempotencyKey);
      const response = await fetch("/api/admin/infrastructure/environments", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          toolType,
          name: name.trim(),
          idempotencyKey,
          deployment: selection,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Не удалось создать среду."));
      }
      setMessage("Среда поставлена в очередь на создание.");
      setCreateDialogOpen(false);
      setCreateCostConfirmed(false);
      setCreatePassword("");
      setCreateMfaCode("");
      setCreateIdempotencyKey(null);
      await refresh();
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Не удалось создать среду.",
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
          <Button asChild variant="ghost" className="-ml-3 mb-4">
            <Link href="/admin/tools">
              <ArrowLeft aria-hidden="true" />
              Инструменты
            </Link>
          </Button>
          <h1 className="font-display text-page-title">Среда n8n</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Вычислительные ресурсы и стоимость
          </p>
        </div>
        <Button variant="outline" onClick={() => void refresh(selection)}>
          <RefreshCw aria-hidden="true" />
          Обновить тарифы
        </Button>
      </div>

      {loadError ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Конфигурация не обновлена</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : null}

      {preview?.ok ? (
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b px-4 py-5 sm:px-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-display text-xl">Конфигурация среды</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Тарифы проверены{" "}
                  {new Date(preview.catalog.checkedAt).toLocaleString("ru-RU")}.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm">
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
                    className="min-h-11 min-w-48 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
                    aria-label="Регион среды"
                  >
                    {preview.catalog.regions.map((region) => (
                      <option key={region.id} value={region.id}>
                        {region.label} · {region.availabilityZone}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm">
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
                    className="min-h-11 min-w-48 rounded-md border bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/35"
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

          <div className="space-y-2 p-3 sm:p-5">
            <div className="hidden grid-cols-[1.1fr_0.8fr_0.9fr_0.9fr_1.2fr] gap-4 px-4 py-1 text-xs text-muted-foreground sm:grid">
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
                  className={`grid min-h-16 w-full grid-cols-2 gap-x-4 gap-y-3 rounded-lg border p-4 text-left transition-colors sm:grid-cols-[1.1fr_0.8fr_0.9fr_0.9fr_1.2fr] sm:items-center ${
                    selected
                      ? "border-foreground/35 bg-accent"
                      : "border-transparent bg-muted/35 hover:border-border hover:bg-muted"
                  } focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/35`}
                >
                  <span>
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      CPU
                    </span>
                    <span className="flex items-center gap-2 font-semibold">
                      {preset.cpu} vCPU
                      {selected ? (
                        <Check className="size-4 text-status-ready" aria-hidden="true" />
                      ) : null}
                    </span>
                  </span>
                  <span>
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      RAM
                    </span>
                    <span className="font-semibold">
                      {preset.ramMb / 1_024} ГБ
                    </span>
                  </span>
                  <span>
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      NVMe
                    </span>
                    <span className="font-semibold">
                      {preset.diskMb / 1_024} ГБ
                    </span>
                  </span>
                  <span>
                    <span className="block text-xs text-muted-foreground sm:hidden">
                      Канал
                    </span>
                    <span className="font-semibold">
                      {preset.bandwidthMbps === 1_000
                        ? "1 Гбит/с"
                        : `${preset.bandwidthMbps} Мбит/с`}
                    </span>
                  </span>
                  <span className="col-span-2 flex items-baseline justify-between gap-2 border-t pt-3 sm:col-span-1 sm:block sm:border-0 sm:pt-0">
                    <span className="font-semibold">
                      {preset.monthlyRoubles.toLocaleString("ru-RU")} ₽/мес
                    </span>
                    <span className="text-sm text-muted-foreground sm:mt-0.5 sm:block">
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

          <div className="grid gap-3 border-t bg-muted/20 p-4 sm:grid-cols-2 sm:p-6">
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
              className="flex min-h-20 items-center justify-between gap-4 rounded-lg border bg-card p-4 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/35"
            >
              <span className="flex gap-3">
                <HardDrive className="mt-0.5 size-5 text-muted-foreground" aria-hidden="true" />
                <span>
                  <span className="block font-medium">Автобэкапы</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Раз в неделю, хранить 1 копию · 6 ₽/ГБ за копию
                  </span>
                </span>
              </span>
              <span
                className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition ${
                  selection?.backupsEnabled ? "bg-foreground" : "bg-input"
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
            <div className="flex min-h-20 items-center gap-3 rounded-lg border bg-card p-4">
              <ShieldCheck className="size-5 text-status-ready" aria-hidden="true" />
              <div>
                <p className="font-medium">Публичный IPv4 включён</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
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
      ) : !loaded ? (
        <div className="overflow-hidden rounded-xl border bg-card p-5 sm:p-6">
          <Skeleton className="h-6 w-52" />
          <Skeleton className="mt-3 h-4 w-72 max-w-full" />
          <div className="mt-8 space-y-2">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Создание среды</CardTitle>
          <CardDescription>
            Сейчас платформа создаёт сам сервер с Ubuntu и публичным IP.
            Установка n8n пока запускается отдельно после создания.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
          <label className="grid gap-1.5 text-sm">
            Название среды
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              aria-label="Название среды"
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
            <AlertDialog
              open={createDialogOpen}
              onOpenChange={(open) => {
                setCreateDialogOpen(open);
                if (!open && !pending) {
                  setCreateCostConfirmed(false);
                  setCreatePassword("");
                  setCreateMfaCode("");
                  setCreateError(null);
                  setCreateIdempotencyKey(null);
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <Button
                  size="lg"
                  disabled={
                    !preview?.ok || !selection || activeEnvironment || pending
                  }
                >
                  <Plus aria-hidden="true" />
                  Создать среду
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Создать «{name.trim() || "Учебная среда"}»?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    Будут созданы один новый VPS и один публичный IPv4. Бэкапы{" "}
                    {selection?.backupsEnabled ? "включены" : "выключены"}.
                    Timeweb списывает оплату почасово.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="space-y-3">
                  <div className="rounded-md border bg-muted/40 p-3 text-sm">
                    <p className="font-medium">VPS + IPv4</p>
                    <p className="mt-1 text-lg font-semibold">
                      {preview?.ok
                        ? preview.plan.monthlyTotalRoubles.toLocaleString("ru-RU")
                        : "—"}{" "}
                      ₽/мес
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Перед созданием требуется свежая повторная аутентификация.
                    </p>
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={createCostConfirmed}
                      onChange={(event) =>
                        setCreateCostConfirmed(event.target.checked)
                      }
                      className="mt-1"
                    />
                    Подтверждаю создание платных ресурсов по показанной цене.
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Пароль Neurokurs
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={createPassword}
                      onChange={(event) => setCreatePassword(event.target.value)}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Код из приложения (если включён)
                    <Input
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={createMfaCode}
                      onChange={(event) =>
                        setCreateMfaCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      placeholder="000000"
                    />
                  </label>
                  {createError ? (
                    <p className="text-sm text-destructive" aria-live="polite">
                      {createError}
                    </p>
                  ) : null}
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={pending}>Отмена</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={
                      !createCostConfirmed || createPassword.length < 12 || pending
                    }
                    onClick={(event) => {
                      event.preventDefault();
                      void create();
                    }}
                  >
                    {pending ? (
                      <Loader2 aria-hidden="true" className="animate-spin" />
                    ) : null}
                    Подтвердить и создать
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          {activeEnvironment ? (
            <p className="text-sm text-muted-foreground lg:col-span-2">
              Сначала удалите активную среду: сейчас доступна одна среда.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <section className="grid gap-3" aria-live="polite" aria-busy={!loaded}>
        {message ? (
          <p className="text-sm" role="status">
            {message}
          </p>
        ) : null}
        {!loaded ? (
          <Skeleton className="h-24 w-full rounded-xl" />
        ) : loadError ? null : environments.length === 0 ? (
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
                  {environment.currentOperation ? (
                    <p className="mt-2 text-sm text-muted-foreground" role="status">
                      {operationStepLabel(environment.currentOperation)}
                    </p>
                  ) : environment.installationStatus ===
                    "ready_owner_setup_required" ? (
                    <p className="mt-2 text-sm text-status-ready">
                      n8n готов — требуется создать владельца.
                    </p>
                  ) : environment.status === "active" ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Сервер готов. n8n ещё не установлен.
                    </p>
                  ) : environment.status === "deleted" ? (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Удаление окончательное. Чтобы продолжить, создайте новую
                      среду.
                    </p>
                  ) : null}
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
                <div className="flex flex-wrap gap-2">
                  {environment.publicUrl ? (
                    <Button asChild variant="outline" size="sm" className="min-h-11">
                      <a
                        href={`/api/admin/tools/n8n/launch?environmentId=${encodeURIComponent(environment.id)}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть n8n
                        <ExternalLink aria-hidden="true" />
                      </a>
                    </Button>
                  ) : null}
                  {["active", "degraded"].includes(environment.status) &&
                  environment.installationStatus !==
                    "ready_owner_setup_required" &&
                  (!environment.currentOperation ||
                    environment.currentOperation.canResume) ? (
                    <InstallEnvironment
                      environment={environment}
                      toolType={toolType}
                      resume={environment.currentOperation?.canResume ?? false}
                      onAccepted={() => void refresh()}
                    />
                  ) : null}
                  {["active", "degraded", "cleanup_required"].includes(
                    environment.status,
                  ) &&
                  (!environment.currentOperation ||
                    environment.currentOperation.canResume) ? (
                    <DeleteEnvironment
                      environment={environment}
                      toolType={toolType}
                      onAccepted={() => void refresh()}
                    />
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </section>
    </main>
  );
}
