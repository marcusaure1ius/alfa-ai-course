import { redirect } from "next/navigation";

import { StudentShell } from "@/components/student/student-shell";
import {
  getCourseProgress,
  getStudentProgressLabel,
} from "@/lib/student-course";
import { requirePageSession } from "@/server/auth/page-access";
import { getStudentWorkspaceCourse } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageSession();
  if (session.role === "admin") redirect("/admin/tools");
  const course = await getStudentWorkspaceCourse(getDatabase(), session.userId);
  const progress = course ? getCourseProgress(course) : null;
  return (
    <StudentShell
      email={session.email}
      courseTitle={course?.title ?? null}
      progressLabel={getStudentProgressLabel(progress)}
    >
      {children}
    </StudentShell>
  );
}
