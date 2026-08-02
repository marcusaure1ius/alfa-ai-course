import { StudentEmptyState } from "@/components/student/student-empty-state";
import { StudentProgramView } from "@/components/student/student-program-view";
import { requirePageSession } from "@/server/auth/page-access";
import { getStudentWorkspaceCourse } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentProgramPage() {
  const session = await requirePageSession();
  const course = await getStudentWorkspaceCourse(getDatabase(), session.userId);
  if (!course) return <StudentEmptyState kind="locked" />;
  return <StudentProgramView course={course} />;
}
