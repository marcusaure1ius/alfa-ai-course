import type { LucideIcon } from "lucide-react";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
    <section className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <p className="font-mono text-[0.68rem] uppercase tracking-[0.15em] text-primary">
        Панель управления
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <Card className="mt-6 max-w-2xl border-dashed">
        <CardHeader>
          <span className="mb-3 flex size-10 items-center justify-center rounded-md bg-secondary">
            <Icon aria-hidden="true" className="size-5 text-primary" />
          </span>
          <CardTitle>Раздел подготовлен в навигации</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </section>
  );
}
