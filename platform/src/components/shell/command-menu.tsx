"use client";

import * as React from "react";
import {
  History,
  ListChecks,
  Search,
  Server,
  Settings2,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

const entries = [
  { href: "/admin/infrastructure", label: "Серверы", icon: Server },
  { href: "/admin/operations", label: "Операции", icon: ListChecks },
  { href: "/admin/students", label: "Ученики", icon: Users },
  { href: "/admin/audit", label: "Аудит", icon: History },
  { href: "/admin/settings", label: "Настройки", icon: Settings2 },
] as const;

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const returnFocusRef = React.useRef<HTMLElement | null>(null);

  function rememberFocus() {
    returnFocusRef.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== document.body
        ? document.activeElement
        : triggerRef.current;
  }

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        typeof event.key === "string" &&
        event.key.toLowerCase() === "k" &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        setOpen((value) => {
          if (!value) rememberFocus();
          return !value;
        });
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  function navigate(href: string) {
    setOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        className="min-h-11 w-full justify-start gap-2 text-muted-foreground sm:w-64"
        onClick={() => {
          rememberFocus();
          setOpen(true);
        }}
        aria-label="Открыть поиск и команды"
      >
        <Search aria-hidden="true" />
        <span className="truncate">Найти раздел</span>
        <kbd className="ml-auto hidden rounded border bg-muted px-1.5 font-mono text-[0.65rem] sm:inline">
          ⌘ K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Поиск по платформе"
        description="Перейдите к нужному разделу панели управления."
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (returnFocusRef.current ?? triggerRef.current)?.focus();
        }}
      >
        <CommandInput placeholder="Введите название раздела…" />
        <CommandList>
          <CommandEmpty>Раздел не найден.</CommandEmpty>
          <CommandGroup heading="Разделы">
            {entries.map(({ href, label, icon: Icon }, index) => (
              <CommandItem key={href} onSelect={() => navigate(href)}>
                <Icon aria-hidden="true" />
                {label}
                <CommandShortcut>{index + 1}</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
