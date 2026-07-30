"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { AdminCourseOption } from "@/server/admin/workspace";

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) throw new Error("CSRF_UNAVAILABLE");
  return body.csrfToken;
}

export function StudentCourseAccess({
  studentId,
  currentCourseId,
  courses,
}: {
  studentId: string;
  currentCourseId: string | null;
  courses: AdminCourseOption[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function update(courseId: string, granted: boolean) {
    setPendingId(courseId);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/admin/students/${studentId}/access`, {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({ courseId, granted }),
      });
      if (!response.ok) throw new Error("Не удалось изменить доступ.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Не удалось изменить доступ.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {courses.length > 0 ? (
          courses.map((course, index) => {
            const active = course.id === currentCourseId;
            return (
              <div
                key={course.id}
                className={
                  "flex flex-wrap items-center justify-between gap-4 px-5 py-4 " +
                  (index > 0 ? "border-t" : "")
                }
              >
                <div>
                  <p className="text-sm font-medium">{course.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {course.status === "published" ? "Опубликован" : "Черновик"}
                  </p>
                </div>
                <Button
                  variant={active ? "outline" : "default"}
                  disabled={pendingId !== null}
                  onClick={() => update(course.id, !active)}
                >
                  {pendingId === course.id ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : null}
                  {active ? "Отозвать доступ" : "Открыть доступ"}
                </Button>
              </div>
            );
          })
        ) : (
          <p className="px-5 py-8 text-sm text-muted-foreground">
            Сначала создайте курс.
          </p>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
