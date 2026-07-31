"use client";

import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CommandMenu } from "./command-menu";

export function AdminHeader() {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b bg-card/95 px-3 backdrop-blur sm:px-5">
      <SidebarTrigger
        className="size-11 shrink-0"
        aria-label="Открыть или свернуть навигацию"
      />
      <NeurokursBrand className="lg:hidden" />
      <div className="ml-auto shrink-0">
        <CommandMenu />
      </div>
    </header>
  );
}
