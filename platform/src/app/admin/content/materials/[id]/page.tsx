import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MaterialEditor } from "@/components/admin/material-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAdminMaterial } from "@/server/admin/workspace";
import { getDatabase } from "@/server/db/client";

export default async function AdminMaterialPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const material = await getAdminMaterial(getDatabase(), id);
  if (!material) notFound();

  return (
    <main className="page-container">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/admin/content">
          <ArrowLeft aria-hidden="true" />
          Контент
        </Link>
      </Button>
      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {material.courseTitle} / {material.sectionTitle}
          </p>
          <h1 className="font-display mt-2 text-page-title">{material.title}</h1>
        </div>
        <Badge variant={material.status === "published" ? "success" : "outline"}>
          {material.status === "published" ? "Опубликован" : "Черновик"}
        </Badge>
      </div>
      <div className="mt-9">
        <MaterialEditor material={material} />
      </div>
    </main>
  );
}
