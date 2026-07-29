import {
  AlertTriangle,
  ArrowUpRight,
  CircleDollarSign,
  Clock3,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Server,
} from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type InfrastructureViewState = "empty" | "list" | "error";

const demoEnvironment = {
  id: "fake-primary",
  name: "Основная учебная среда",
  status: "degraded",
  region: "Москва · ru-1a",
  configuration: "2 vCPU · 4 GB · 50 GB",
  ip: "203.0.113.24",
  domain: "n8n.neurokurs.ru",
  version: "n8n 2.4.8",
  cost: "≈ 1 290 ₽ / мес.",
  updated: "4 минуты назад",
} as const;

function StatusBadge() {
  return (
    <Badge variant="outline" className="gap-1.5 border-destructive/25">
      <AlertTriangle aria-hidden="true" className="size-3 text-destructive" />
      Требует внимания
    </Badge>
  );
}

function RowActions() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-11"
          aria-label="Действия со средой"
        >
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Среда</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={`/admin/infrastructure/${demoEnvironment.id}`}>
            Открыть карточку
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem disabled>Обновить состояние</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled className="text-destructive">
          Удалить…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EnvironmentTable() {
  return (
    <>
      <Card className="hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Среда</TableHead>
                <TableHead>Состояние</TableHead>
                <TableHead>Размещение</TableHead>
                <TableHead>Адрес</TableHead>
                <TableHead>Расходы</TableHead>
                <TableHead className="w-14">
                  <span className="sr-only">Действия</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>
                  <Link
                    href={`/admin/infrastructure/${demoEnvironment.id}`}
                    className="font-medium underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {demoEnvironment.name}
                  </Link>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Владелец: школа
                  </p>
                </TableCell>
                <TableCell>
                  <StatusBadge />
                  <p className="mt-2 text-xs text-muted-foreground">
                    n8n health неизвестен
                  </p>
                </TableCell>
                <TableCell>
                  <p>{demoEnvironment.region}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {demoEnvironment.configuration}
                  </p>
                </TableCell>
                <TableCell>
                  <p className="font-mono text-xs">{demoEnvironment.ip}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {demoEnvironment.domain}
                  </p>
                </TableCell>
                <TableCell>
                  <p>{demoEnvironment.cost}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Provider data
                  </p>
                </TableCell>
                <TableCell>
                  <RowActions />
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="md:hidden">
        <CardHeader>
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate">{demoEnvironment.name}</CardTitle>
              <CardDescription>Владелец: школа</CardDescription>
            </div>
            <RowActions />
          </div>
          <StatusBadge />
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Регион</p>
              <p className="mt-1 break-words">{demoEnvironment.region}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Конфигурация</p>
              <p className="mt-1 break-words">{demoEnvironment.configuration}</p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Публичный IP</p>
              <p className="mt-1 break-all font-mono text-xs">
                {demoEnvironment.ip}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">Расходы</p>
              <p className="mt-1 break-words">{demoEnvironment.cost}</p>
            </div>
          </div>
          <Button asChild variant="outline" className="min-h-11 w-full">
            <Link href={`/admin/infrastructure/${demoEnvironment.id}`}>
              Открыть карточку
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

export function InfrastructureView({
  state,
}: {
  state: InfrastructureViewState;
}) {
  return (
    <section
      className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8"
      aria-labelledby="infrastructure-title"
    >
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-[0.68rem] font-medium uppercase tracking-[0.15em] text-primary">
            Инфраструктура · серверы
          </p>
          <h1
            id="infrastructure-title"
            className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Учебные среды
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Здесь видны VPS, домен, состояние n8n и оценка расходов. В текущем
            foundation используются только fake и empty data.
          </p>
        </div>
        <Button disabled className="min-h-11 w-full sm:w-auto">
          <Plus aria-hidden="true" />
          Создать среду
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3" aria-label="Сводка">
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-secondary">
              <Server aria-hidden="true" className="size-4 text-primary" />
            </span>
            <div>
              <p className="font-mono text-xl font-semibold">
                {state === "empty" ? "0" : "1"}
              </p>
              <p className="text-xs text-muted-foreground">Учебных сред</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-secondary">
              <CircleDollarSign aria-hidden="true" className="size-4 text-primary" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {state === "empty" ? "Нет расходов" : demoEnvironment.cost}
              </p>
              <p className="text-xs text-muted-foreground">Provider estimate</p>
            </div>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardContent className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-md bg-secondary">
              <Clock3 aria-hidden="true" className="size-4 text-primary" />
            </span>
            <div>
              <p className="text-sm font-semibold">
                {state === "empty" ? "Не синхронизировано" : demoEnvironment.updated}
              </p>
              <p className="text-xs text-muted-foreground">Последнее обновление</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {state === "error" ? (
        <Alert variant="destructive" aria-live="polite">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Provider временно не отвечает</AlertTitle>
          <AlertDescription>
            Показаны последние безопасные данные от fake adapter. Платные
            действия заблокированы до успешной синхронизации.
          </AlertDescription>
        </Alert>
      ) : null}

      {state === "empty" ? (
        <Card className="border-dashed">
          <CardHeader className="items-center px-5 pt-10 text-center">
            <span className="mb-3 flex size-11 items-center justify-center rounded-md bg-secondary">
              <Server aria-hidden="true" className="size-5 text-primary" />
            </span>
            <CardTitle>Сред пока нет</CardTitle>
            <CardDescription className="max-w-md">
              Сначала настройте server-only подключение провайдера. Production
              credentials в этом окружении не используются.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center border-0 bg-transparent pb-10">
            <Button variant="outline" disabled className="min-h-11">
              <RefreshCw aria-hidden="true" />
              Подключение недоступно в fake mode
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <EnvironmentTable />
      )}

      <p className="sr-only" aria-live="polite">
        {state === "empty"
          ? "Учебных сред нет."
          : "Показана одна учебная среда с демонстрационными данными."}
      </p>
    </section>
  );
}
