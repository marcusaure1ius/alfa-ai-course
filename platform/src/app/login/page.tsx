import { redirect } from "next/navigation";

import { LoginForm } from "@/components/auth/login-form";
import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
import { getPageSession } from "@/server/auth/page-access";

export default async function LoginPage() {
  const session = await getPageSession();
  if (session) {
    redirect(session.role === "admin" ? "/admin/tools" : "/student");
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-background p-3 sm:p-6 lg:p-8">
      <div className="grid min-h-[calc(100svh-1.5rem)] w-full max-w-[81rem] overflow-hidden rounded-2xl bg-card sm:min-h-[calc(100svh-3rem)] lg:min-h-[48.25rem] lg:grid-cols-[minmax(0,1.55fr)_minmax(24rem,0.85fr)] lg:p-10">
        <section className="flex min-h-[25rem] flex-col px-6 py-7 sm:px-10 sm:py-9 lg:min-h-0 lg:p-0">
          <NeurokursBrand />
          <div className="my-auto max-w-[43rem] py-14 lg:pr-12">
            <h1 className="font-display text-[clamp(2.8rem,5.5vw,5.5rem)] leading-[0.98] tracking-[-0.04em]">
              Сначала понять.
              <br />
              Потом{" "}
              <span className="relative inline-block whitespace-nowrap">
                <span
                  aria-hidden="true"
                  className="absolute inset-x-[-0.08em] bottom-[0.02em] h-[0.54em] rounded-full bg-highlight"
                />
                <span className="relative">сделать.</span>
              </span>
            </h1>
            <p className="mt-8 max-w-[36rem] text-balance text-lg leading-7 text-muted-foreground sm:text-xl sm:leading-8">
              Материалы, пояснения и учебные инструменты курса — в одном
              пространстве.
            </p>
          </div>
        </section>

        <section className="flex items-center bg-brand px-6 py-10 text-brand-foreground sm:px-10 lg:rounded-xl lg:px-10 lg:py-12">
          <div className="mx-auto w-full max-w-sm">
            <h2 className="font-display text-[2rem] leading-tight text-white">
              Вход
            </h2>
            <div className="mt-8">
              <LoginForm inverse />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
