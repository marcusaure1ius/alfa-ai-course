"use client";

import { List } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export type TocItem = {
  id: string;
  label: string;
  level: number;
};

function TocLinks({
  items,
  onSelect,
}: {
  items: TocItem[];
  onSelect?: (id: string) => void;
}) {
  return (
    <nav aria-label="Оглавление материала">
      <ol className="space-y-1">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="block min-h-11 rounded-md py-2.5 text-sm leading-5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
              style={{ paddingLeft: `${Math.max(0, item.level - 2) * 12}px` }}
              onClick={
                onSelect
                  ? (event) => {
                      event.preventDefault();
                      onSelect(item.id);
                    }
                  : undefined
              }
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function MaterialToc({
  items,
  mode,
}: {
  items: TocItem[];
  mode: "mobile" | "desktop";
}) {
  const [open, setOpen] = useState(false);
  const pendingSelection = useRef<string | null>(null);

  if (items.length === 0) return null;
  return mode === "desktop" ? (
    <aside className="sticky top-24 hidden self-start xl:block">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          На этой странице
        </p>
        <TocLinks items={items} />
    </aside>
  ) : (
    <div className="mb-8 xl:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" className="w-full justify-between sm:w-auto">
            Оглавление
            <List aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent
          side="right"
          className="w-[min(88vw,22rem)] p-0"
          onCloseAutoFocus={(event) => {
            const id = pendingSelection.current;
            if (!id) return;
            event.preventDefault();
            pendingSelection.current = null;
            window.requestAnimationFrame(() => {
              const target = document.getElementById(id);
              if (!target) return;
              window.history.replaceState(null, "", `#${encodeURIComponent(id)}`);
              target.scrollIntoView({ block: "start" });
              target.focus({ preventScroll: true });
            });
          }}
        >
          <SheetHeader className="border-b p-6 text-left">
            <SheetTitle>Оглавление</SheetTitle>
            <SheetDescription>Разделы текущего материала</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto p-6">
            <TocLinks
              items={items}
              onSelect={(id) => {
                pendingSelection.current = id;
                setOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
