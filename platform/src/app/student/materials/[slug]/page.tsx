import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";

import { CompleteMaterialButton } from "@/components/student/complete-material-button";
import { MaterialToc } from "@/components/student/material-toc";
import { MaterialReadingProgress } from "@/components/student/material-reading-progress";
import { PracticeMaterialActions } from "@/components/student/practice-material-actions";
import {
  hasCourseMarkdownContent,
  parseCourseMarkdown,
  SafeMarkdown,
} from "@/components/student/safe-markdown";
import { StudentEmptyState } from "@/components/student/student-empty-state";
import { Button } from "@/components/ui/button";
import { flattenMaterials } from "@/lib/student-course";
import { requirePageSession } from "@/server/auth/page-access";
import {
  getStudentCourse,
  getStudentMaterial,
} from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentMaterialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const session = await requirePageSession();
  const { slug } = await params;
  const material = await getStudentMaterial(getDatabase(), session.userId, slug);
  if (!material) return <StudentEmptyState kind="missing" />;
  const course = await getStudentCourse(
    getDatabase(),
    session.userId,
    material.course.slug,
  );
  const materials = course ? flattenMaterials(course) : [];
  const index = materials.findIndex((item) => item.id === material.id);
  const previous = index > 0 ? materials[index - 1] ?? null : null;
  const next =
    index >= 0 && index < materials.length - 1 ? materials[index + 1] ?? null : null;
  const { toc } = parseCourseMarkdown(material.bodyMarkdown);
  const hasReadableBody = hasCourseMarkdownContent(material.bodyMarkdown);

  return (
    <div className="px-5 py-8 sm:px-8 sm:py-12 xl:px-12">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm text-muted-foreground">
          <Link
            href={`/student/program?course=${encodeURIComponent(material.course.slug)}`}
            className="hover:text-foreground"
          >
            {material.section.title}
          </Link>
          <span className="px-2" aria-hidden="true">
            /
          </span>
          {material.kind === "practice" ? "Практика" : "Материал"}
        </p>
        <div className="mt-4 max-w-4xl">
          <h1 className="font-display break-words text-3xl leading-[1.12] text-balance [overflow-wrap:anywhere] sm:text-5xl">
            {material.title}
          </h1>
          <div className="mt-5 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>{material.course.title}</span>
            {material.estimatedMinutes ? (
              <span className="flex items-center gap-1.5">
                <Clock3 className="size-4" aria-hidden="true" />
                {material.estimatedMinutes} мин
              </span>
            ) : null}
            {material.completedAt ? (
              <span className="font-medium text-status-ready">Пройдено</span>
            ) : null}
          </div>
        </div>

        {material.summary ? (
          <div className="mt-8 max-w-3xl rounded-xl bg-highlight p-5 sm:p-6">
            <p className="break-words text-base leading-7 [overflow-wrap:anywhere]">
              {material.summary}
            </p>
          </div>
        ) : null}

        <div className="mt-10 grid items-start gap-12 xl:grid-cols-[minmax(0,70ch)_14rem]">
          <article className="min-w-0">
            <MaterialReadingProgress
              key={material.id}
              materialId={material.id}
              initialPosition={material.lastPosition}
            />
            <MaterialToc items={toc} mode="mobile" />
            <SafeMarkdown source={material.bodyMarkdown} />
          </article>
          <MaterialToc items={toc} mode="desktop" />
        </div>

        <footer className="mt-14 border-t pt-6">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div className="flex flex-wrap gap-2">
              {previous ? (
                <Button asChild variant="outline">
                  <Link href={`/student/materials/${previous.slug}`}>
                    <ArrowLeft aria-hidden="true" />
                    Назад
                  </Link>
                </Button>
              ) : null}
              {next ? (
                <Button asChild variant="ghost">
                  <Link href={`/student/materials/${next.slug}`}>
                    Следующий
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              ) : null}
            </div>
            {hasReadableBody ? (
              material.kind === "practice" ? (
                <PracticeMaterialActions
                  materialId={material.id}
                  courseSlug={material.course.slug}
                  completed={Boolean(material.completedAt)}
                  nextHref={next ? `/student/materials/${next.slug}` : null}
                />
              ) : (
                <CompleteMaterialButton
                  materialId={material.id}
                  courseSlug={material.course.slug}
                  completed={Boolean(material.completedAt)}
                  nextHref={next ? `/student/materials/${next.slug}` : null}
                />
              )
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
