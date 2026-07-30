import { BookOpen } from "lucide-react";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/auth/logout-button";
import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
import { requirePageSession } from "@/server/auth/page-access";

export default async function StudentPage() {
  const session = await requirePageSession();
  if (session.role === "admin") redirect("/admin/infrastructure");

  return (
    <main className="min-h-svh bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <NeurokursBrand />
          <div className="flex min-w-0 items-center gap-3">
            <span className="hidden truncate text-sm text-muted-foreground sm:block">
              {session.email}
            </span>
            <div className="w-24">
              <LogoutButton />
            </div>
          </div>
        </div>
      </header>

      <section className="page-container">
        <div className="flex min-h-[34rem] items-center justify-center">
          <div className="max-w-lg text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-highlight">
              <BookOpen className="size-5" aria-hidden="true" />
            </span>
            <h1 className="font-display text-page-title mt-6">
              Материалы курса скоро появятся
            </h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              Здесь будут собраны пояснения, задания и учебные инструменты.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
