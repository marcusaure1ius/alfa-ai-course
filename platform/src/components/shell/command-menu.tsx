"use client";

import * as React from "react";
import {
  ArrowRight,
  BookOpenText,
  LibraryBig,
  ListTree,
  LoaderCircle,
  Search,
  ServerCog,
  Users,
  Wrench,
} from "lucide-react";
import { useRouter } from "next/navigation";

import type {
  AdminSearchKind,
  AdminSearchResponse,
  AdminSearchResult,
} from "@/lib/admin-search";
import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const quickLinks = [
  { href: "/admin/courses", label: "Курсы", icon: LibraryBig },
  { href: "/admin/program", label: "Разделы", icon: ListTree },
  { href: "/admin/students", label: "Ученики", icon: Users },
  { href: "/admin/tools", label: "Инструменты", icon: Wrench },
] as const;

const resultIcons: Record<AdminSearchKind, typeof Search> = {
  course: LibraryBig,
  section: ListTree,
  material: BookOpenText,
  student: Users,
  tool: Wrench,
  environment: ServerCog,
};

const resultGroups: ReadonlyArray<{
  heading: string;
  kinds: readonly AdminSearchKind[];
}> = [
  { heading: "Курсы", kinds: ["course"] },
  { heading: "Разделы", kinds: ["section"] },
  { heading: "Задания", kinds: ["material"] },
  { heading: "Ученики", kinds: ["student"] },
  { heading: "Инструменты", kinds: ["tool", "environment"] },
];

type SearchStatus = "idle" | "loading" | "success" | "error";

export function CommandMenu() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<AdminSearchResult[]>([]);
  const [status, setStatus] = React.useState<SearchStatus>("idle");
  const router = useRouter();
  const openRef = React.useRef(false);
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
        const nextOpen = !openRef.current;
        if (nextOpen) rememberFocus();
        openRef.current = nextOpen;
        setOpen(nextOpen);
        if (!nextOpen) {
          setQuery("");
          setResults([]);
          setStatus("idle");
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    const normalizedQuery = query.trim();
    if (!open || normalizedQuery.length < 2) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const response = await fetch(
          `/api/admin/search?q=${encodeURIComponent(normalizedQuery)}`,
          {
            signal: controller.signal,
            headers: { accept: "application/json" },
          },
        );
        if (!response.ok) throw new Error("SEARCH_FAILED");
        const payload = (await response.json()) as Partial<AdminSearchResponse>;
        if (!Array.isArray(payload.results)) throw new Error("INVALID_SEARCH");
        setResults(payload.results);
        setStatus("success");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setStatus("error");
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [open, query]);

  function changeOpen(value: boolean) {
    openRef.current = value;
    setOpen(value);
    if (!value) {
      setQuery("");
      setResults([]);
      setStatus("idle");
    }
  }

  function changeQuery(value: string) {
    setQuery(value);
    if (value.trim().length < 2) {
      setResults([]);
      setStatus("idle");
    }
  }

  function navigate(href: string) {
    changeOpen(false);
    router.push(href);
  }

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="outline"
        className="h-10 w-10 justify-center gap-2 px-0 text-muted-foreground sm:w-80 sm:justify-start sm:px-4 lg:w-[28rem]"
        onClick={() => {
          rememberFocus();
          changeOpen(true);
        }}
        aria-label="Открыть поиск и команды"
      >
        <Search aria-hidden="true" />
        <span className="hidden truncate sm:inline">Найти в платформе</span>
        <kbd className="ml-auto hidden font-sans text-[11px] font-medium tracking-[0.08em] text-muted-foreground/60 sm:inline">
          ⌘K
        </kbd>
      </Button>
      <CommandDialog
        open={open}
        onOpenChange={changeOpen}
        title="Поиск по платформе"
        description="Найдите курс, раздел, задание, ученика или инструмент."
        shouldFilter={false}
        className="sm:max-w-[42rem]"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (returnFocusRef.current ?? triggerRef.current)?.focus();
        }}
      >
        <CommandInput
          value={query}
          onValueChange={changeQuery}
          placeholder="Курс, раздел, задание, ученик или инструмент…"
          aria-label="Глобальный поиск"
        />
        <CommandList className="max-h-[min(26rem,65vh)] px-2 pb-2">
          {query.trim().length === 0 ? (
            <CommandGroup heading="Быстрые переходы">
              {quickLinks.map(({ href, label, icon: Icon }) => (
                <CommandItem key={href} onSelect={() => navigate(href)}>
                  <Icon aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  <ArrowRight className="opacity-40" aria-hidden="true" />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {query.trim().length === 1 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              Введите ещё один символ, чтобы начать поиск.
            </div>
          ) : null}

          {status === "loading" ? (
            <div
              className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground"
              role="status"
            >
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Ищем по всей платформе…
            </div>
          ) : null}

          {status === "error" ? (
            <div className="px-4 py-10 text-center" role="alert">
              <p className="text-sm font-medium">Поиск временно недоступен</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Измените запрос или попробуйте ещё раз.
              </p>
            </div>
          ) : null}

          {status === "success" && results.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium">Ничего не найдено</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Проверьте написание или введите более общее слово.
              </p>
            </div>
          ) : null}

          {status === "success"
            ? resultGroups.map((group) => {
                const groupResults = results.filter((result) =>
                  group.kinds.includes(result.kind),
                );
                if (groupResults.length === 0) return null;
                return (
                  <CommandGroup heading={group.heading} key={group.heading}>
                    {groupResults.map((result) => {
                      const Icon = resultIcons[result.kind];
                      return (
                        <CommandItem
                          className="items-start"
                          key={`${result.kind}-${result.id}`}
                          value={`${result.kind}-${result.id}`}
                          onSelect={() => navigate(result.href)}
                        >
                          <Icon className="mt-0.5" aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {result.title}
                            </span>
                            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                              {result.detail}
                            </span>
                          </span>
                          <ArrowRight className="mt-0.5 opacity-40" aria-hidden="true" />
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                );
              })
            : null}
        </CommandList>
      </CommandDialog>
    </>
  );
}
