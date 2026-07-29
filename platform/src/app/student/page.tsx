import { ExternalLink, GraduationCap, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePageSession } from "@/server/auth/page-access";

export default async function StudentPage() {
  const session = await requirePageSession();

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b">
        <div className="mx-auto flex min-h-16 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GraduationCap aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold">Кабинет ученика</p>
              <p className="truncate text-xs text-muted-foreground">
                {session.email}
              </p>
            </div>
          </div>
          <Badge variant="outline">Ученик</Badge>
        </div>
      </header>
      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <div>
          <p className="font-mono text-[0.68rem] uppercase tracking-[0.15em] text-primary">
            Стартовая страница
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            Ваша учебная среда
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Административная навигация, provider ID, IP, расходы и операции здесь
            не отображаются.
          </p>
        </div>
        <Card className="max-w-2xl">
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Основная среда</CardTitle>
              <Badge variant="secondary">Готовится</Badge>
            </div>
            <CardDescription>
              Публичная ссылка появится после проверки DNS, TLS и health.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="flex items-start gap-3 rounded-md bg-muted p-4">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0 text-primary"
              />
              <p className="text-sm leading-6 text-muted-foreground">
                Ученику не нужен доступ к облачному аккаунту или root SSH.
              </p>
            </div>
            <Button disabled className="min-h-11 w-full sm:w-fit">
              <ExternalLink aria-hidden="true" />
              Открыть n8n
            </Button>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
