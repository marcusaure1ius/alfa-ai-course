import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
import {
  StudentMobileMenu,
  StudentNavigation,
} from "@/components/student/student-navigation";
import { displayStudentName, studentInitial } from "@/lib/student-course";

type StudentShellProps = {
  email: string;
  courseTitle: string | null;
  progressLabel: string | null;
  currentMaterialHref: string | null;
  children: ReactNode;
};

export function StudentShell({
  email,
  courseTitle,
  progressLabel,
  currentMaterialHref,
  children,
}: StudentShellProps) {
  const navigation = { courseTitle, progressLabel, currentMaterialHref };
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-40 h-16 border-b bg-card/95 backdrop-blur">
        <div className="flex h-full items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <NeurokursBrand />
          </div>
          <div className="flex items-center gap-2">
            <details className="group relative hidden sm:block">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring">
                <span className="max-w-40 truncate text-sm text-muted-foreground">
                  {displayStudentName(email)}
                </span>
                <span className="font-display flex size-8 items-center justify-center rounded-full bg-foreground text-xs text-background">
                  {studentInitial(email)}
                </span>
              </summary>
              <div className="absolute right-0 mt-2 w-52 rounded-xl border bg-popover p-2 shadow-lg">
                <p className="truncate px-2 py-2 text-xs text-muted-foreground">
                  {email}
                </p>
                <LogoutButton />
              </div>
            </details>
            <StudentMobileMenu {...navigation} email={email} />
          </div>
        </div>
      </header>
      <div className="mx-auto flex min-h-[calc(100svh-4rem)] max-w-[90rem]">
        <aside className="sticky top-16 hidden h-[calc(100svh-4rem)] w-60 shrink-0 border-r bg-card lg:block">
          <StudentNavigation {...navigation} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
