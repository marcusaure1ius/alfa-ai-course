import {
  Cable,
  CircleDollarSign,
  DatabaseZap,
  KeyRound,
  ServerCog,
} from "lucide-react";

import { ConnectionTest } from "@/components/timeweb/connection-test";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { readTimewebRuntimeGate } from "@/server/providers/timeweb";

const endpoints = [
  ["Серверы", "/api/v1/servers", ServerCog],
  ["Тарифы и ОС", "/api/v1/presets/servers · /api/v1/os/servers", DatabaseZap],
  ["Регионы и зоны", "/api/v2/locations", Cable],
  ["Баланс и account status", "/api/v1/account/finances · /api/v1/account/status", CircleDollarSign],
] as const;

export default function TimewebPage() {
  const gate = readTimewebRuntimeGate();

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Provider boundary / read v1
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Подключение Timeweb
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Безопасная диагностика account и актуального каталога. Browser не принимает и
            не получает raw credential или provider response.
          </p>
        </div>
        <Badge variant={gate.mode === "timeweb" ? "default" : "secondary"}>
          {gate.mode === "timeweb" ? "Production read-only" : "Fake mode"}
        </Badge>
      </div>

      <Alert>
        <KeyRound aria-hidden="true" />
        <AlertTitle>Production secret отделён</AlertTitle>
        <AlertDescription>
          TIMEWEB_API_TOKEN читается только server-side и только при VERCEL_ENV=production.
          Preview и local development принудительно используют fake adapter.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Connection test</CardTitle>
            <CardDescription>
              Проверяет шесть allowlisted GET endpoint и нормализует ответ во внутренний DTO.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionTest />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Граница permissions</CardTitle>
            <CardDescription>Что можно подтвердить без mutation.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p>
              Read-доступ подтверждается фактическими GET запросами. Service scope и флаг
              удаления без кода проверяются вручную в панели Timeweb.
            </p>
            <p className="text-muted-foreground">
              Документированного action-level introspection API не обнаружено; create/delete
              остаются закрыты отдельными gates.
            </p>
          </CardContent>
        </Card>
      </div>

      <section aria-labelledby="read-contract-title">
        <div className="mb-3">
          <h2 id="read-contract-title" className="text-lg font-semibold">
            Read contract
          </h2>
          <p className="text-sm text-muted-foreground">
            Цены и provider IDs не фиксируются в runtime-коде.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {endpoints.map(([label, path, Icon]) => (
            <Card key={label} size="sm">
              <CardContent className="flex items-start gap-3">
                <div className="rounded-lg border bg-muted/40 p-2">
                  <Icon aria-hidden="true" className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-medium">{label}</p>
                  <p className="mt-1 break-words font-mono text-xs text-muted-foreground">
                    GET {path}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
