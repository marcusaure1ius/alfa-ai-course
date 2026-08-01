import type { ReactNode } from "react";
import Link from "next/link";

import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
import {
  StudentMobileMenu,
  StudentNavigation,
} from "@/components/student/student-navigation";
import { StudentProfileMenu } from "@/components/student/student-profile-menu";

type StudentShellProps = {
  email: string;
  courseTitle: string | null;
  progressLabel: string | null;
  children: ReactNode;
};

export function StudentShell({
  email,
  courseTitle,
  progressLabel,
  children,
}: StudentShellProps) {
  const navigation = { courseTitle, progressLabel };
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 h-16 border-b bg-card/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-4 sm:px-6">
          <Link
            href="/student"
            className="flex min-h-11 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            aria-label="На главную Neurokurs"
          >
            <NeurokursBrand />
          </Link>
          <div className="flex items-center gap-2">
            <StudentProfileMenu email={email} />
            <StudentMobileMenu {...navigation} email={email} />
          </div>
        </div>
      </header>
      <div className="flex min-h-[calc(100svh-4rem)] w-full">
        <aside className="sticky top-16 hidden h-[calc(100svh-4rem)] w-60 shrink-0 border-r bg-card lg:block">
          <StudentNavigation {...navigation} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
