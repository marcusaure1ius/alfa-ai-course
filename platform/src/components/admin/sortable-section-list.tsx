"use client";

import {
  Accessibility,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/dom";
import { DragDropProvider } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { ChevronRight, Eye, EyeOff, GripVertical, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { SectionRowActions } from "@/components/admin/section-row-actions";
import {
  resolveSectionVisibility,
  type PublicationStatus,
} from "@/lib/publication-visibility";
import { cn } from "@/lib/utils";
import type { AdminSectionOption } from "@/server/admin/workspace";

export type SortableSectionListItem = {
  section: AdminSectionOption;
  materialCount: number;
  publishedMaterialCount: number;
};

export function reorderSectionItems<T>(
  items: T[],
  fromIndex: number,
  toIndex: number,
): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return items;
  }

  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    cache: "no-store",
    credentials: "same-origin",
  });
  const body = (await response.json()) as { csrfToken?: string };
  if (!body.csrfToken) {
    throw new Error("Не удалось подготовить защищённый запрос.");
  }
  return body.csrfToken;
}

async function responseError(response: Response): Promise<Error> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return new Error(
    body?.error?.message ?? "Не удалось сохранить порядок разделов.",
  );
}

function sectionTitle(source: { data?: Record<string, unknown> } | null) {
  return typeof source?.data?.title === "string"
    ? source.data.title
    : "Раздел";
}

function SortableSectionRow({
  courseStatus,
  index,
  item,
  sortingDisabled,
}: {
  courseStatus: PublicationStatus;
  index: number;
  item: SortableSectionListItem;
  sortingDisabled: boolean;
}) {
  const { handleRef, isDragging, ref } = useSortable({
    id: item.section.id,
    index,
    data: { title: item.section.title },
    disabled: sortingDisabled,
    transition: { duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" },
  });
  const visibility = resolveSectionVisibility(
    courseStatus,
    item.section.status,
  );

  return (
    <li
      ref={ref}
      id={`section-${item.section.id}`}
      data-drag-sort-item=""
      className={cn(
        "group relative flex scroll-mt-20 flex-wrap items-center gap-x-3 gap-y-3 border-b px-5 py-4 transition-[background-color,box-shadow,opacity] duration-200 last:border-b-0 hover:bg-muted/35 sm:px-7 motion-reduce:transition-none",
        isDragging &&
          "relative z-10 bg-card opacity-95 shadow-sm ring-1 ring-foreground/10",
      )}
    >
      <Link
        href={`/admin/program/sections/${item.section.id}`}
        className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        aria-label={`Открыть раздел «${item.section.title}»`}
      />
      <button
        ref={handleRef}
        type="button"
        className="relative z-20 -ml-2 inline-flex size-9 shrink-0 touch-none cursor-grab items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing disabled:cursor-default disabled:opacity-35 motion-reduce:transition-none"
        aria-label={`Изменить порядок раздела «${item.section.title}»`}
        aria-roledescription="сортируемый раздел"
        disabled={sortingDisabled}
      >
        <GripVertical className="size-[18px]" aria-hidden="true" />
      </button>

      <span className="pointer-events-none relative z-10 min-w-[12rem] flex-[1_1_16rem]">
        <span className="block text-sm font-medium transition-colors group-hover:text-foreground">
          {index + 1}. {item.section.title}
        </span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {item.publishedMaterialCount} из {item.materialCount} опубликовано
        </span>
      </span>

      <span className="pointer-events-none relative z-10 ml-auto flex shrink-0 flex-wrap items-center justify-end gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-xs font-medium",
            visibility.visible
              ? "text-status-ready"
              : "text-muted-foreground",
          )}
        >
          {visibility.visible ? (
            <Eye className="size-4" aria-hidden="true" />
          ) : (
            <EyeOff className="size-4" aria-hidden="true" />
          )}
          {visibility.label}
        </span>
        <ChevronRight
          className="pointer-events-none size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
          aria-hidden="true"
        />
        <span className="pointer-events-auto relative z-20">
          <SectionRowActions
            section={item.section}
            materialCount={item.materialCount}
          />
        </span>
      </span>
    </li>
  );
}

export function SortableSectionList({
  courseId,
  courseStatus,
  initialItems,
}: {
  courseId: string;
  courseStatus: PublicationStatus;
  initialItems: SortableSectionListItem[];
}) {
  const router = useRouter();
  const serverFingerprint = JSON.stringify(initialItems);
  const previousServerFingerprint = useRef(serverFingerprint);
  const [items, setItems] = useState(initialItems);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (serverFingerprint !== previousServerFingerprint.current) {
      previousServerFingerprint.current = serverFingerprint;
      setItems(initialItems);
    }
  }, [initialItems, serverFingerprint]);

  async function persistOrder(nextItems: SortableSectionListItem[]) {
    const csrf = await csrfToken();
    const response = await fetch(
      `/api/admin/courses/${courseId}/sections/order`,
      {
        method: "PUT",
        credentials: "same-origin",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify({
          sectionIds: nextItems.map((item) => item.section.id),
        }),
      },
    );
    if (!response.ok) throw await responseError(response);
  }

  return (
    <>
      <DragDropProvider
        plugins={(defaults) => [
          ...defaults,
          Accessibility.configure({
            screenReaderInstructions: {
              draggable:
                "Нажмите пробел или Enter, чтобы поднять раздел. Меняйте позицию стрелками вверх и вниз. Нажмите пробел или Enter ещё раз, чтобы поставить раздел, либо Escape для отмены.",
            },
            announcements: {
              dragstart({ operation: { source } }: DragStartEvent) {
                if (!source) return;
                return `Раздел «${sectionTitle(source)}» поднят.`;
              },
              dragover({ operation: { source, target } }: DragOverEvent) {
                if (!source || !isSortable(source)) return;
                if (!target) return `Раздел «${sectionTitle(source)}» вне списка.`;
                return `Раздел «${sectionTitle(source)}» перемещён на позицию ${source.index + 1}.`;
              },
              dragend({ operation: { source }, canceled }: DragEndEvent) {
                if (!source) return;
                return canceled
                  ? `Перемещение раздела «${sectionTitle(source)}» отменено.`
                  : `Раздел «${sectionTitle(source)}» установлен.`;
              },
            },
          }),
        ]}
        onDragEnd={async (event) => {
          if (event.canceled) return;
          const { source } = event.operation;
          if (!isSortable(source) || source.initialIndex === source.index) {
            return;
          }

          const previousItems = items;
          const nextItems = reorderSectionItems(
            previousItems,
            source.initialIndex,
            source.index,
          );
          setItems(nextItems);
          setSaving(true);
          setError(null);
          try {
            await persistOrder(nextItems);
            router.refresh();
          } catch (caught) {
            setItems(previousItems);
            setError(
              caught instanceof Error
                ? caught.message
                : "Не удалось сохранить порядок разделов.",
            );
          } finally {
            setSaving(false);
          }
        }}
      >
        <ol aria-label="Разделы курса">
          {items.map((item, index) => (
            <SortableSectionRow
              key={item.section.id}
              courseStatus={courseStatus}
              index={index}
              item={item}
              sortingDisabled={saving || items.length < 2}
            />
          ))}
        </ol>
      </DragDropProvider>
      {saving ? (
        <p
          className="flex items-center gap-2 border-t px-5 py-2 text-xs text-muted-foreground sm:px-7"
          role="status"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Сохраняем порядок…
        </p>
      ) : null}
      {error ? (
        <p className="border-t px-5 py-2 text-xs text-destructive sm:px-7" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}
