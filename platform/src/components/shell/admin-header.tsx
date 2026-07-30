"use client";

import { ChevronRight } from "lucide-react";
import { usePathname } from "next/navigation";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CommandMenu } from "./command-menu";

const names: Record<string, string> = {
  infrastructure: "Серверы",
  operations: "Операции",
  students: "Ученики",
  audit: "Аудит",
  settings: "Настройки",
};

export function AdminHeader() {
  const segment = usePathname().split("/").filter(Boolean).at(1) ?? "infrastructure";

  return (
    <header className="sticky top-0 z-20 flex min-h-16 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur sm:px-5">
      <SidebarTrigger
        className="size-11 shrink-0"
        aria-label="Открыть или свернуть навигацию"
      />
      <Separator orientation="vertical" className="hidden h-5 sm:block" />
      <Breadcrumb className="hidden min-w-0 md:block">
        <BreadcrumbList>
          <BreadcrumbItem>Панель управления</BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight aria-hidden="true" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbPage>{names[segment] ?? "Серверы"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="ml-auto min-w-0 flex-1 sm:flex-initial">
        <CommandMenu />
      </div>
    </header>
  );
}
