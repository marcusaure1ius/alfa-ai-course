import { ArrowRight, GraduationCap, Server } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getPageSession } from "@/server/auth/page-access";

export default async function LoginPage() {
  const session = await getPageSession();
  if (session) {
    redirect(session.role === "admin" ? "/admin/infrastructure" : "/student");
  }

  return (
    <main className="login-canvas grid min-h-svh lg:grid-cols-[minmax(0,1.08fr)_minmax(28rem,0.92fr)]">
      <section className="hidden min-h-svh flex-col justify-between border-r p-10 lg:flex xl:p-16">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
            Н
          </span>
          <div>
            <p className="font-semibold tracking-tight">Нейрокурс</p>
            <p className="text-xs text-muted-foreground">neurokurs.ru</p>
          </div>
        </div>

        <div className="max-w-xl">
          <p className="text-sm font-medium text-primary">
            Один вход — два кабинета
          </p>
          <h1 className="mt-4 text-balance text-5xl font-semibold leading-[1.06] tracking-[-0.05em] xl:text-6xl">
            Учитесь и управляйте серверами в одном месте.
          </h1>
          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border bg-card/80 p-5 backdrop-blur">
              <GraduationCap className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-6 font-medium">Кабинет ученика</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Материалы курса и доступ к учебной среде.
              </p>
            </div>
            <div className="rounded-2xl border bg-card/80 p-5 backdrop-blur">
              <Server className="size-5 text-primary" aria-hidden="true" />
              <p className="mt-6 font-medium">Панель администратора</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Создание серверов и контроль их состояния.
              </p>
            </div>
          </div>
        </div>

        <p className="text-sm text-muted-foreground">
          Платформа курса по автоматизации с n8n
        </p>
      </section>

      <section className="flex min-h-svh items-center justify-center px-4 py-10 sm:px-8">
        <Card className="w-full max-w-md shadow-[0_28px_90px_-46px_oklch(0.38_0.18_257/0.55)]">
          <CardHeader className="gap-2 px-6 pt-6 sm:px-8 sm:pt-8">
            <div className="mb-5 flex items-center gap-3 lg:hidden">
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary font-semibold text-primary-foreground">
                Н
              </span>
              <span className="font-semibold">Нейрокурс</span>
            </div>
            <CardTitle className="text-2xl tracking-tight">
              Войти в кабинет
            </CardTitle>
            <CardDescription>
              Используйте email и пароль, которые вы получили для курса.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-6 pb-6 sm:px-8 sm:pb-8">
            <LoginForm />
            <p className="mt-6 flex items-center gap-2 text-xs leading-5 text-muted-foreground">
              После входа мы сразу откроем ваш кабинет
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
