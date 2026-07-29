import {
  Activity,
  AlertTriangle,
  Box,
  ExternalLink,
  Globe2,
  History,
  Server,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const details = [
  ["Владелец", "Школа"],
  ["Регион и зона", "Москва · ru-1a"],
  ["Конфигурация", "2 vCPU · 4 GB · 50 GB"],
  ["Provider ID", "fake-server-primary"],
] as const;

export default async function EnvironmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <section className="mx-auto flex w-full max-w-[1440px] min-w-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-mono text-[0.68rem] uppercase tracking-[0.15em] text-primary">
              Среда · {id}
            </p>
            <Badge variant="outline" className="gap-1.5">
              <AlertTriangle
                aria-hidden="true"
                className="size-3 text-destructive"
              />
              Degraded
            </Badge>
          </div>
          <h1 className="mt-2 break-words text-2xl font-semibold tracking-tight sm:text-3xl">
            Основная учебная среда
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Fake detail skeleton без provider credentials и реальных cloud calls.
          </p>
        </div>
        <Button variant="outline" disabled className="min-h-11 w-full sm:w-auto">
          <ExternalLink aria-hidden="true" />
          Открыть n8n
        </Button>
      </div>

      <Alert>
        <Activity aria-hidden="true" />
        <AlertTitle>Состояние устарело</AlertTitle>
        <AlertDescription>
          Последняя fake-синхронизация была 4 минуты назад. Mutation недоступны,
          пока read-only проверка не завершится успешно.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="overview" className="min-w-0">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview" className="min-h-11">
            <Server aria-hidden="true" />
            Обзор
          </TabsTrigger>
          <TabsTrigger value="operations" className="min-h-11">
            <History aria-hidden="true" />
            Операции
          </TabsTrigger>
          <TabsTrigger value="software" className="min-h-11">
            <Box aria-hidden="true" />
            ПО
          </TabsTrigger>
          <TabsTrigger value="domain" className="min-h-11">
            <Globe2 aria-hidden="true" />
            Домен и TLS
          </TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Параметры среды</CardTitle>
              <CardDescription>
                Без secret, cloud-init и private key.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-0">
              {details.map(([label, value], index) => (
                <div key={label}>
                  {index > 0 ? <Separator /> : null}
                  <div className="grid gap-1 py-4 sm:grid-cols-[11rem_1fr]">
                    <span className="text-sm text-muted-foreground">{label}</span>
                    <span className="min-w-0 break-all font-mono text-sm">
                      {value}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Публичный адрес</CardTitle>
              <CardDescription>Виден только после успешного TLS.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <div>
                <p className="text-muted-foreground">Домен</p>
                <p className="mt-1 break-all font-mono">n8n.neurokurs.ru</p>
              </div>
              <Separator />
              <div>
                <p className="text-muted-foreground">IP</p>
                <p className="mt-1 font-mono">203.0.113.24</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="operations" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Журнал операций появится позже</CardTitle>
              <CardDescription>
                Финальная визуализация durable timeline входит в отдельную задачу.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
        <TabsContent value="software" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Профиль установки не применён</CardTitle>
              <CardDescription>
                Runtime starter-kit не изменяется в рамках T‑0051.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
        <TabsContent value="domain" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>DNS и TLS не проверялись</CardTitle>
              <CardDescription>
                Значения демонстрационные; реальный provider adapter не вызывается.
              </CardDescription>
            </CardHeader>
          </Card>
        </TabsContent>
      </Tabs>
    </section>
  );
}
