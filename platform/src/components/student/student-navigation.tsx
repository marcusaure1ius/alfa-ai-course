"use client";

import {
  CircleHelp,
  LibraryBig,
  Menu,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof LibraryBig;
  exact?: boolean;
}> = [
  { href: "/student", label: "Мои курсы", icon: LibraryBig },
  { href: "/student/tools", label: "Инструменты", icon: Wrench },
  { href: "/student/help", label: "Помощь", icon: CircleHelp },
] as const;

type StudentNavigationProps = {
  courseCount: number;
  email?: string;
  mobile?: boolean;
};

function courseCountLabel(courseCount: number): string {
  const mod100 = courseCount % 100;
  const mod10 = courseCount % 10;
  const word =
    mod100 >= 11 && mod100 <= 14
      ? "курсов"
      : mod10 === 1
        ? "курс"
        : mod10 >= 2 && mod10 <= 4
          ? "курса"
          : "курсов";
  return `${courseCount} ${word}`;
}

export function StudentNavigation({
  courseCount,
  email,
  mobile = false,
}: StudentNavigationProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Навигация ученика"
      className="flex min-h-0 flex-1 flex-col"
    >
      <div className={cn("shrink-0 px-4 pb-6", mobile ? "pt-2" : "pt-7")}>
        <p className="font-display text-[1rem] leading-5">Обучение</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {courseCountLabel(courseCount)} в доступе
        </p>
      </div>
      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-2">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active =
            href === "/student"
              ? pathname === href ||
                pathname.startsWith("/student/program") ||
                pathname.startsWith("/student/materials/")
              : exact
                ? pathname === href
                : pathname === href || pathname.startsWith(`${href}/`);
          const link = (
            <Link
              href={href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                active
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-[1.05rem]" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
          return mobile ? (
            <SheetClose asChild key={label}>
              {link}
            </SheetClose>
          ) : (
            <div key={label}>{link}</div>
          );
        })}
      </div>
      {mobile && email ? (
        <div className="shrink-0 border-t p-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))]">
          <div>
            <p className="truncate px-2 pb-1 text-xs text-muted-foreground">
              {email}
            </p>
            <LogoutButton />
          </div>
        </div>
      ) : null}
    </nav>
  );
}

export function StudentMobileMenu(
  props: Omit<StudentNavigationProps, "mobile">,
) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="lg:hidden"
          aria-label="Открыть навигацию"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(88vw,22rem)] gap-0 overflow-hidden bg-card p-0">
        <SheetHeader className="shrink-0 border-b px-5 py-5 text-left">
          <SheetTitle>
            <SheetClose asChild>
              <Link
                href="/student"
                className="inline-flex min-h-11 items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label="На главную Neurokurs"
              >
                <NeurokursBrand />
              </Link>
            </SheetClose>
          </SheetTitle>
        </SheetHeader>
        <StudentNavigation {...props} mobile />
      </SheetContent>
    </Sheet>
  );
}
