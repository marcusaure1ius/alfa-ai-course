import { BookOpen, GraduationCap, Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { Card, CardContent } from "@/components/ui/card";
import { requirePageSession } from "@/server/auth/page-access";

export default async function StudentPage() {
  const session = await requirePageSession();
  if (session.role === "admin") redirect("/admin/infrastructure");

  return (
    <main className="login-canvas min-h-svh bg-background">
      <header className="border-b bg-background/90 backdrop-blur">
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
          <div className="w-24">
            <LogoutButton />
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-5xl gap-6 px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto mt-8 max-w-2xl text-center sm:mt-16">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookOpen className="size-6" aria-hidden="true" />
          </span>
          <p className="mt-6 text-sm font-medium text-primary">Кабинет готов</p>
          <h1 className="mt-3 text-balance text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">
            Здесь появятся материалы курса
          </h1>
          <p className="mx-auto mt-4 max-w-lg text-pretty text-sm leading-6 text-muted-foreground sm:text-base">
            Пока кабинет пуст. Когда программа курса будет опубликована, вы
            увидите здесь уроки, задания и ссылку на свою учебную среду.
          </p>
        </div>

        <Card className="mx-auto mt-4 max-w-xl border-dashed bg-card/70">
          <CardContent className="flex items-start gap-3 py-5">
            <Sparkles
              className="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            <p className="text-sm leading-6 text-muted-foreground">
              Ничего настраивать не нужно — доступ появится автоматически.
            </p>
          </CardContent>
        </Card>
      </section>
    </main>
  );
}
