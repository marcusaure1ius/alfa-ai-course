import { AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";

import { StudentN8nAccessCard } from "@/components/student/student-n8n-access";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { requirePageSession } from "@/server/auth/page-access";
import { getDatabase } from "@/server/db/client";
import { getStudentN8nAccess } from "@/server/tools/student-access";

export default async function StudentN8nPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const session = await requirePageSession();
  const [access, query] = await Promise.all([
    getStudentN8nAccess(getDatabase(), session.userId),
    searchParams,
  ]);
  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/student/tools"
          className="-ml-3 inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Инструменты
        </Link>
        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_18rem]">
          <section>
            <span
              className="font-display flex size-16 items-center justify-center rounded-xl bg-foreground text-xl text-background"
              aria-hidden="true"
            >
              n8n
            </span>
            <h1 className="font-display mt-6 text-4xl">n8n</h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground">
              Учебная среда для практики. Возможность входа зависит от текущего
              состояния доступа.
            </p>
            {query.notice === "launch-unavailable" ? (
              <Alert className="mt-6" aria-live="polite">
                <AlertTriangle aria-hidden="true" />
                <AlertTitle>Вход больше недоступен</AlertTitle>
                <AlertDescription>
                  Состояние изменилось до открытия новой вкладки. Проверьте его
                  ещё раз или подготовьте сообщение о проблеме.
                </AlertDescription>
              </Alert>
            ) : null}
            <div className="mt-8">
              <StudentN8nAccessCard access={access} />
            </div>
          </section>
          <aside className="self-start rounded-xl border bg-muted/35 p-6">
            <p className="font-display text-lg leading-tight">
              Перед началом
            </p>
            <p className="mt-3 text-base leading-7 text-muted-foreground">
              Входите только через Neurokurs. Не добавляйте пароли, токены или
              ключи в сообщение о проблеме.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
