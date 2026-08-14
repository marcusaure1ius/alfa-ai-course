"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { SectionEditDialog } from "@/components/admin/section-dialogs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatCount } from "@/lib/plural";
import type { AdminSectionOption } from "@/server/admin/workspace";

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

async function responseError(
  response: Response,
  fallback: string,
): Promise<Error> {
  const body = (await response.json().catch(() => null)) as
    | { error?: { message?: string } }
    | null;
  return new Error(body?.error?.message ?? fallback);
}

function materialCountLabel(count: number): string {
  return formatCount(count, {
    one: "материал",
    few: "материала",
    many: "материалов",
  });
}

export function SectionRowActions({
  section,
  materialCount,
}: {
  section: AdminSectionOption;
  materialCount: number;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const csrf = await csrfToken();
      const response = await fetch(`/api/admin/sections/${section.id}`, {
        method: "DELETE",
        credentials: "same-origin",
        headers: { "x-csrf-token": csrf },
      });
      if (!response.ok) {
        throw await responseError(response, "Не удалось удалить раздел.");
      }
      setDeleteOpen(false);
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Не удалось удалить раздел.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <TooltipProvider delayDuration={250}>
        <SectionEditDialog section={section} />

        <AlertDialog
          open={deleteOpen}
          onOpenChange={(open) => !pending && setDeleteOpen(open)}
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:text-destructive"
                  aria-label={`Удалить раздел «${section.title}»`}
                  disabled={pending}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </AlertDialogTrigger>
            </TooltipTrigger>
            <TooltipContent sideOffset={6}>Удалить раздел</TooltipContent>
          </Tooltip>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {materialCount > 0
                  ? "Раздел пока нельзя удалить"
                  : `Удалить раздел «${section.title}»?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {materialCount > 0
                  ? `В разделе ${materialCountLabel(materialCount)}. Сначала перенесите или удалите ${materialCount === 1 ? "его" : "их"}, чтобы не потерять учебный контент.`
                  : "Раздел будет удалён без возможности восстановления. Порядок остальных разделов обновится автоматически."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>
                {materialCount > 0 ? "Понятно" : "Отмена"}
              </AlertDialogCancel>
              {materialCount === 0 ? (
                <AlertDialogAction
                  className="bg-destructive text-white hover:bg-destructive/90"
                  disabled={pending}
                  onClick={remove}
                >
                  {pending ? (
                    <Loader2 className="animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 aria-hidden="true" />
                  )}
                  {pending ? "Удаляем…" : "Удалить"}
                </AlertDialogAction>
              ) : null}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TooltipProvider>
      {error ? (
        <span
          className="basis-full text-right text-xs text-destructive"
          role="alert"
        >
          {error}
        </span>
      ) : null}
    </div>
  );
}
