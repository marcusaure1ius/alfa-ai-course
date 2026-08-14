import { ChevronRight, Search } from "lucide-react";
import Link from "next/link";

import { StudentCreateForm } from "@/components/admin/student-create-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatCount } from "@/lib/plural";
import { getAdminCourses, getAdminStudents } from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const sql = getDatabase();
  const [students, courses] = await Promise.all([
    getAdminStudents(sql),
    getAdminCourses(sql),
  ]);
  const params = await searchParams;
  const query = params.q?.trim().toLowerCase() ?? "";
  const status = params.status === "active" || params.status === "blocked" ? params.status : "all";
  const visibleStudents = students.filter((student) =>
    (!query || student.email.toLowerCase().includes(query)) &&
    (status === "all" || student.status === status),
  );

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b pb-6">
        <div>
          <h1 className="font-display text-page-title">Ученики</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {formatCount(students.length, {
              one: "аккаунт",
              few: "аккаунта",
              many: "аккаунтов",
            })}
          </p>
        </div>
        <StudentCreateForm courses={courses} />
      </div>

      <form method="get" className="mt-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-medium">
          Поиск
          <span className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-4 size-4 text-muted-foreground" aria-hidden="true" />
            <input className="h-12 w-full rounded-md border border-input bg-card pl-10 pr-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm" type="search" name="q" defaultValue={params.q} placeholder="Email ученика" />
          </span>
        </label>
        <div className="grid gap-2 text-sm font-medium">
          <span id="student-status-label">Статус</span>
          <Select name="status" defaultValue={status}>
            <SelectTrigger
              aria-labelledby="student-status-label"
              className="w-full bg-card px-3.5 text-base data-[size=default]:h-12 md:text-sm"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="all">Все</SelectItem>
              <SelectItem value="active">Активные</SelectItem>
              <SelectItem value="blocked">Заблокированные</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" variant="outline">Применить</Button>
      </form>

      <div className="mt-6 overflow-hidden rounded-xl border bg-card">
        {visibleStudents.length > 0 ? (
          <>
            <div className="divide-y md:hidden">
              {visibleStudents.map((student) => (
                <Link
                  key={student.id}
                  href={`/admin/students/${student.id}`}
                  className="group flex min-h-24 items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring motion-reduce:transition-none"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block break-all text-sm font-medium">
                      {student.email}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2">
                      {student.courseTitles.length > 0 ? (
                        <span className="text-sm text-muted-foreground">
                          {student.courseTitles.join(", ")}
                        </span>
                      ) : (
                        <Badge variant="outline">Нет курса</Badge>
                      )}
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {student.publishedMaterials > 0
                          ? `${student.completedMaterials} / ${student.publishedMaterials}`
                          : "—"}
                      </span>
                    </span>
                    {student.status === "blocked" ? (
                      <Badge variant="destructive" className="mt-2">
                        Заблокирован
                      </Badge>
                    ) : null}
                    <span className="mt-2 block text-xs text-muted-foreground">
                      Добавлен {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(new Date(student.createdAt))}
                    </span>
                  </span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
            <div className="hidden md:block">
              <div role="table" aria-label="Ученики">
                <div role="rowgroup" className="border-b">
                  <div
                    role="row"
                    className="grid grid-cols-[minmax(0,1.5fr)_minmax(10rem,0.7fr)_minmax(8rem,0.55fr)_minmax(10rem,0.7fr)_2rem] items-center gap-4 px-5"
                  >
                    <span role="columnheader" className="py-3 text-left text-sm font-medium">
                      Ученик
                    </span>
                    <span role="columnheader" className="py-3 text-left text-sm font-medium">
                      Доступ
                    </span>
                    <span role="columnheader" className="py-3 text-left text-sm font-medium">
                      Прогресс
                    </span>
                    <span role="columnheader" className="py-3 text-left text-sm font-medium">
                      Добавлен
                    </span>
                    <span role="columnheader" className="sr-only">
                      Открыть
                    </span>
                  </div>
                </div>
                <div role="rowgroup" className="divide-y">
                  {visibleStudents.map((student) => (
                    <div
                      key={student.id}
                      role="row"
                      className="group relative grid grid-cols-[minmax(0,1.5fr)_minmax(10rem,0.7fr)_minmax(8rem,0.55fr)_minmax(10rem,0.7fr)_2rem] items-center gap-4 px-5 transition-colors duration-200 hover:bg-muted/35 focus-within:bg-muted/35 motion-reduce:transition-none"
                    >
                      <div role="cell" className="py-4">
                        <Link
                          href={`/admin/students/${student.id}`}
                          className="absolute inset-0 z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                          aria-label={`Открыть ученика ${student.email}`}
                        />
                        <span className="pointer-events-none relative z-20 font-medium">
                          {student.email}
                          {student.status === "blocked" ? (
                            <Badge variant="destructive" className="ml-2">
                              Заблокирован
                            </Badge>
                          ) : null}
                        </span>
                      </div>
                      <div role="cell" className="pointer-events-none py-4">
                        {student.courseTitles.length > 0 ? (
                          <span className="text-sm">
                            {student.courseTitles.join(", ")}
                          </span>
                        ) : (
                          <Badge variant="outline">Нет курса</Badge>
                        )}
                      </div>
                      <div
                        role="cell"
                        className="pointer-events-none py-4 tabular-nums text-muted-foreground"
                      >
                        {student.publishedMaterials > 0
                          ? `${student.completedMaterials} / ${student.publishedMaterials}`
                          : "—"}
                      </div>
                      <div
                        role="cell"
                        className="pointer-events-none py-4 text-sm text-muted-foreground"
                      >
                        {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(new Date(student.createdAt))}
                      </div>
                      <div role="cell" className="pointer-events-none py-4">
                        <ChevronRight
                          className="relative z-20 size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
                          aria-hidden="true"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        ) : students.length === 0 ? (
          <div className="px-6 py-14">
            <h2 className="font-display text-xl">Пока нет учеников</h2>
            <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
              Добавленные аккаунты появятся здесь. После этого ученику можно
              открыть доступ к курсу.
            </p>
          </div>
        ) : (
          <div className="px-6 py-12">
            <h2 className="font-display text-xl">Ничего не найдено</h2>
            <p className="mt-2 text-sm text-muted-foreground">Измените поисковый запрос или статус.</p>
          </div>
        )}
      </div>
    </main>
  );
}
