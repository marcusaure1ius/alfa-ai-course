import { StudentEmptyState } from "@/components/student/student-empty-state";
import { StudentProgramView } from "@/components/student/student-program-view";
import { requirePageSession } from "@/server/auth/page-access";
import { getStudentCourses } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentProgramPage({
  searchParams,
}: {
  searchParams: Promise<{ course?: string | string[] }>;
}) {
  const session = await requirePageSession();
  const courses = await getStudentCourses(getDatabase(), session.userId);
  if (courses.length === 0) return <StudentEmptyState kind="locked" />;
  const requestedCourse = (await searchParams).course;
  const requestedSlug = Array.isArray(requestedCourse)
    ? requestedCourse[0]
    : requestedCourse;
  const course =
    courses.find((candidate) => candidate.slug === requestedSlug) ?? courses[0];
  if (!course) return <StudentEmptyState kind="locked" />;
  return <StudentProgramView course={course} />;
}
