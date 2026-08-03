import { redirect } from "next/navigation";

import { StudentShell } from "@/components/student/student-shell";
import { requirePageSession } from "@/server/auth/page-access";
import { getStudentCourseCount } from "@/server/course/repository";
import { getDatabase } from "@/server/db/client";

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requirePageSession();
  if (session.role === "admin") redirect("/admin/tools");
  const courseCount = await getStudentCourseCount(getDatabase(), session.userId);
  return (
    <StudentShell
      email={session.email}
      courseCount={courseCount}
    >
      {children}
    </StudentShell>
  );
}
