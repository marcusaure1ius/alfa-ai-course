"use client";

import {
  CircleHelp,
  ListTree,
  Menu,
  Play,
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
  icon: typeof ListTree;
  exact?: boolean;
}> = [
  { href: "/student/program", label: "Программа", icon: ListTree },
  { href: "/student", label: "Продолжить", icon: Play, exact: true },
  { href: "/student/tools", label: "Инструменты", icon: Wrench },
  { href: "/student/help", label: "Помощь", icon: CircleHelp },
] as const;

type StudentNavigationProps = {
  courseTitle: string | null;
  progressLabel: string | null;
  currentMaterialHref: string | null;
  email?: string;
  mobile?: boolean;
};

export function StudentNavigation({
  courseTitle,
  progressLabel,
  currentMaterialHref,
  email,
  mobile = false,
}: StudentNavigationProps) {
  const pathname = usePathname();
  const items = navItems.map((item) =>
    item.href === "/student" && currentMaterialHref
      ? { ...item, href: currentMaterialHref, exact: false }
      : item,
  );

  return (
    <nav aria-label="Навигация ученика" className="flex h-full flex-col">
      <div className={cn("px-4 pb-6", mobile ? "pt-2" : "pt-7")}>
        <p className="font-display text-[1rem] leading-5">
          {courseTitle ?? "Учебное пространство"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {progressLabel ?? "Курс появится после выдачи доступа"}
        </p>
      </div>
      <div className="space-y-1 px-2">
        {items.map(({ href, label, icon: Icon, exact }) => {
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          const link = (
            <Link
              href={href}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-medium transition-colors",
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
        <div className="mt-auto border-t p-4">
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
      <SheetContent side="left" className="w-[min(88vw,22rem)] gap-0 bg-card p-0">
        <SheetHeader className="border-b px-5 py-5 text-left">
          <SheetTitle>
            <NeurokursBrand />
          </SheetTitle>
        </SheetHeader>
        <StudentNavigation {...props} mobile />
      </SheetContent>
    </Sheet>
  );
}
