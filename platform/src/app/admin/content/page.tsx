import { ArrowRight, BookOpenText, Clock3 } from "lucide-react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminMaterials } from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const value = key(item);
    groups.set(value, [...(groups.get(value) ?? []), item]);
  }
  return groups;
}

export default async function AdminContentPage() {
  const materials = await getAdminMaterials(getDatabase());
  const published = materials.filter((material) => material.status === "published");
  const courses = groupBy(materials, (material) => material.courseTitle);

  return (
    <main className="page-container">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-page-title">Контент</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {published.length} из {materials.length} материалов опубликовано
          </p>
        </div>
      </div>

      {materials.length > 0 ? (
        <div className="mt-8 space-y-8">
          {[...courses.entries()].map(([courseTitle, courseMaterials]) => {
            const sections = groupBy(
              courseMaterials,
              (material) => material.sectionTitle,
            );
            return (
              <section key={courseTitle} aria-labelledby={`course-${courseTitle}`}>
                <h2
                  id={`course-${courseTitle}`}
                  className="font-display text-xl"
                >
                  {courseTitle}
                </h2>
                <div className="mt-4 overflow-hidden rounded-xl border bg-card">
                  {[...sections.entries()].map(
                    ([sectionTitle, sectionMaterials], sectionIndex) => (
                      <div
                        key={sectionTitle}
                        className={sectionIndex > 0 ? "border-t" : ""}
                      >
                        <div className="bg-muted/40 px-5 py-3">
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                            {sectionTitle}
                          </p>
                        </div>
                        {sectionMaterials.map((material) => (
                          <Link
                            key={material.id}
                            href={`/admin/content/materials/${material.id}`}
                            className="group flex min-h-16 items-center gap-4 border-t px-5 py-3 transition-colors hover:bg-accent"
                          >
                            <BookOpenText
                              className="size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium">
                                {material.title}
                              </span>
                              <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                {material.kind === "practice"
                                  ? "Практика"
                                  : "Материал"}
                                {material.estimatedMinutes ? (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <Clock3 className="size-3" aria-hidden="true" />
                                    {material.estimatedMinutes} мин
                                  </>
                                ) : null}
                              </span>
                            </span>
                            <Badge
                              variant={
                                material.status === "published"
                                  ? "success"
                                  : "outline"
                              }
                            >
                              {material.status === "published"
                                ? "Опубликован"
                                : "Черновик"}
                            </Badge>
                            <ArrowRight
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                            />
                          </Link>
                        ))}
                      </div>
                    ),
                  )}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        <section className="mt-8 max-w-2xl rounded-xl border bg-card px-6 py-12">
          <BookOpenText className="size-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="font-display mt-6 text-2xl">Материалов пока нет</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Сначала создайте курс и его первый раздел через content API. Форма
            создания появится здесь после согласования структуры программы.
          </p>
          <Button asChild variant="outline" className="mt-6">
            <Link href="/admin">Вернуться в обзор</Link>
          </Button>
        </section>
      )}
    </main>
  );
}
