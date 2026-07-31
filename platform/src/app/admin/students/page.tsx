import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";

import { StudentCreateForm } from "@/components/admin/student-create-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
            {students.length} {students.length === 1 ? "аккаунт" : "аккаунтов"}
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
        <label className="grid gap-2 text-sm font-medium">
          Статус
          <select className="h-12 rounded-md border border-input bg-card px-3.5 text-base outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 md:text-sm" name="status" defaultValue={status}>
            <option value="all">Все</option>
            <option value="active">Активные</option>
            <option value="blocked">Заблокированные</option>
          </select>
        </label>
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
                  className="flex min-h-24 items-center gap-4 px-5 py-4 transition-colors hover:bg-accent"
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
                  <ArrowRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              ))}
            </div>
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-5">Ученик</TableHead>
                    <TableHead>Доступ</TableHead>
                    <TableHead>Прогресс</TableHead>
                    <TableHead>Добавлен</TableHead>
                    <TableHead className="w-12">
                      <span className="sr-only">Открыть</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleStudents.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="px-5 py-4">
                        <Link
                          href={`/admin/students/${student.id}`}
                          className="font-medium hover:underline"
                        >
                          {student.email}
                        </Link>
                        {student.status === "blocked" ? (
                          <Badge variant="destructive" className="ml-2">
                            Заблокирован
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {student.courseTitles.length > 0 ? (
                          <span className="text-sm">
                            {student.courseTitles.join(", ")}
                          </span>
                        ) : (
                          <Badge variant="outline">Нет курса</Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {student.publishedMaterials > 0
                          ? `${student.completedMaterials} / ${student.publishedMaterials}`
                          : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium", timeZone: "Europe/Moscow" }).format(new Date(student.createdAt))}
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="ghost" size="icon-sm">
                          <Link
                            href={`/admin/students/${student.id}`}
                            aria-label={`Открыть ${student.email}`}
                          >
                            <ArrowRight aria-hidden="true" />
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
