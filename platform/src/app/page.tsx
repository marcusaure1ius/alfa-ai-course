import {
  ArrowDown,
  Check,
  Database,
  FileText,
  MonitorSmartphone,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

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

const boundaries = [
  {
    icon: MonitorSmartphone,
    label: "Интерфейс",
    title: "Один responsive web",
    description:
      "Next.js App Router формирует единую основу для desktop и mobile без отдельного deployable.",
  },
  {
    icon: Database,
    label: "Данные",
    title: "Neon Postgres",
    description:
      "Production подключается через Vercel Marketplace; локальная разработка не использует cloud credentials.",
  },
  {
    icon: ServerCog,
    label: "Провайдер",
    title: "Только server-side",
    description:
      "Timeweb закрыт typed allowlist boundary. В foundation включён fake mode, реальные вызовы запрещены.",
  },
] as const;

export default function HomePage() {
  return (
    <main className="blueprint-grid min-h-screen bg-background text-foreground">
      <header className="border-b bg-background/92 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div
              className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
              aria-hidden="true"
            >
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Нейрокурс</p>
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                Control plane
              </p>
            </div>
          </div>
          <Badge variant="outline" className="gap-1.5 bg-background">
            <span
              className="size-1.5 rounded-full bg-status-ready"
              aria-hidden="true"
            />
            Foundation
          </Badge>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:py-24">
        <div className="max-w-2xl">
          <p className="mb-5 font-mono text-xs font-medium uppercase tracking-[0.2em] text-primary">
            T‑0049 · изолированная основа
          </p>
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
            Учебная инфраструктура начинается с безопасной границы.
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground sm:text-lg">
            Платформа готова к следующим срезам: auth, интерфейсу и durable
            operations. Starter kit остаётся отдельным продуктом, а реальные
            Timeweb credentials не подключены.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <a href="#boundaries">
                Проверить границы
                <ArrowDown data-icon="inline-end" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#foundation-contract">
                Контракт foundation
                <FileText data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden border-foreground/10 bg-card/96 shadow-[0_24px_80px_-42px_oklch(0.42_0.16_255/0.45)]">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardDescription className="font-mono text-[0.68rem] uppercase tracking-[0.16em]">
                  Deployment boundary
                </CardDescription>
                <CardTitle className="mt-2 text-xl">Один Vercel project</CardTitle>
              </div>
              <Badge className="gap-1.5">
                <Check className="size-3.5" aria-hidden="true" />
                Готово
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="boundary-rail">
              {[
                ["01", "Browser", "Без provider secrets"],
                ["02", "platform/", "Server Components + Functions"],
                ["03", "Timeweb adapter", "Typed allowlist · fake mode"],
              ].map(([index, title, detail]) => (
                <div
                  key={index}
                  className="grid grid-cols-[2.25rem_1fr] gap-4 border-b px-5 py-5 last:border-b-0 sm:px-6"
                >
                  <span className="font-mono text-xs text-primary">{index}</span>
                  <div>
                    <p className="text-sm font-semibold">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <section
        id="boundaries"
        className="scroll-mt-4 border-y bg-background/88"
        aria-labelledby="boundaries-title"
      >
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
          <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:gap-12">
            <div id="foundation-contract">
              <p className="font-mono text-xs font-medium uppercase tracking-[0.2em] text-primary">
                Foundation contract
              </p>
              <h2
                id="boundaries-title"
                className="mt-4 text-3xl font-semibold tracking-[-0.035em]"
              >
                Три границы, которые нельзя смешивать
              </h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Каждая следующая задача расширяет одну из зон, не размывая
                release и secret boundaries.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              {boundaries.map(({ icon: Icon, label, title, description }) => (
                <Card key={label} className="bg-card/96">
                  <CardHeader>
                    <div className="mb-4 flex size-9 items-center justify-center rounded-lg bg-secondary">
                      <Icon className="size-4.5 text-primary" aria-hidden="true" />
                    </div>
                    <CardDescription className="font-mono text-[0.68rem] uppercase tracking-[0.14em]">
                      {label}
                    </CardDescription>
                    <CardTitle className="text-base">{title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {description}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p>Course Control Plane · Foundation без cloud mutations</p>
        <div className="flex items-center gap-3 font-mono text-xs">
          <span>Next.js</span>
          <Separator orientation="vertical" className="h-3!" />
          <span>shadcn/ui</span>
          <Separator orientation="vertical" className="h-3!" />
          <span>Neon</span>
        </div>
      </footer>
    </main>
  );
}
