"use client";

import { NeurokursBrand } from "@/components/brand/neurokurs-brand";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { CommandMenu } from "./command-menu";
import { ProfileMenu } from "./profile-menu";

export function AdminHeader({ email }: { email: string }) {
  return (
    <header className="sticky top-0 z-20 grid h-16 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center bg-background/95 px-3 backdrop-blur sm:px-5">
      <div className="flex min-w-0 items-center gap-3 justify-self-start">
        <SidebarTrigger
          className="size-11 shrink-0"
          aria-label="Открыть или свернуть навигацию"
        />
        <NeurokursBrand className="lg:hidden" />
      </div>
      <div className="shrink-0 justify-self-center">
        <CommandMenu />
      </div>
      <ProfileMenu
        email={email}
        className="flex justify-self-end"
        nameClassName="hidden xl:block"
      />
    </header>
  );
}
