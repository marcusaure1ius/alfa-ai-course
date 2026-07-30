import type { LucideIcon } from "lucide-react";

export function AdminPlaceholder({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <section className="page-container flex-1">
      <h1 className="font-display text-page-title">{title}</h1>
      <div className="surface-panel mt-8 flex min-h-64 max-w-3xl items-center justify-center p-6 sm:p-10">
        <div className="max-w-md text-center">
          <span className="mx-auto flex size-12 items-center justify-center rounded-xl bg-secondary">
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <p className="mt-5 text-base leading-6 text-muted-foreground">
            {description}
          </p>
        </div>
      </div>
    </section>
  );
}
