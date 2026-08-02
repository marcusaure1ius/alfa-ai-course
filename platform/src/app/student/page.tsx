import { StudentCourseCatalog } from "@/components/student/student-course-catalog";
import { StudentEmptyState } from "@/components/student/student-empty-state";
import { requirePageSession } from "@/server/auth/page-access";
import { getStudentCourses } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentPage() {
  const session = await requirePageSession();
  const courses = await getStudentCourses(getDatabase(), session.userId);
  if (courses.length === 0) return <StudentEmptyState kind="locked" />;
  return <StudentCourseCatalog courses={courses} />;
}
