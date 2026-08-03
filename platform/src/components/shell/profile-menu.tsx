"use client";

import { useRef } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { displayStudentName, studentInitial } from "@/lib/student-course";

export function ProfileMenu({
  email,
  className,
  nameClassName,
}: {
  email: string;
  className?: string;
  nameClassName?: string;
}) {
  const closedByPointer = useRef(false);
  const name = displayStudentName(email);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (open) closedByPointer.current = false;
      }}
    >
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring",
            className,
          )}
          aria-label={`Открыть меню профиля ${name}`}
        >
          <span
            className={cn(
              "max-w-40 truncate text-sm text-muted-foreground",
              nameClassName,
            )}
          >
            {name}
          </span>
          <span className="font-display flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-xs text-background">
            {studentInitial(email)}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={4}
        className="w-52 rounded-xl p-2 shadow-lg"
        onPointerDownOutside={() => {
          closedByPointer.current = true;
        }}
        onEscapeKeyDown={() => {
          closedByPointer.current = false;
        }}
        onCloseAutoFocus={(event) => {
          if (!closedByPointer.current) return;
          event.preventDefault();
          closedByPointer.current = false;
        }}
      >
        <DropdownMenuLabel className="truncate px-2 py-2 text-xs font-normal text-muted-foreground">
          {email}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild className="p-0">
          <LogoutButton />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
