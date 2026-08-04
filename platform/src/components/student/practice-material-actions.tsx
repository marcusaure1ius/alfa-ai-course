"use client";

import { useState } from "react";

import { CompleteMaterialButton } from "@/components/student/complete-material-button";
import { PracticeSubmissionDialog } from "@/components/student/practice-submission-dialog";

export function PracticeMaterialActions({
  materialId,
  courseSlug,
  completed,
  nextHref,
}: {
  materialId: string;
  courseSlug: string;
  completed: boolean;
  nextHref: string | null;
}) {
  const [draftPrepared, setDraftPrepared] = useState(false);

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <PracticeSubmissionDialog
        materialId={materialId}
        onDraftSaved={() => setDraftPrepared(true)}
        triggerLabel={draftPrepared ? "Изменить черновик" : "Подготовить ответ"}
        triggerVariant={draftPrepared ? "outline" : "default"}
      />
      <CompleteMaterialButton
        materialId={materialId}
        courseSlug={courseSlug}
        completed={completed}
        nextHref={nextHref}
        triggerVariant={draftPrepared ? "default" : "outline"}
        triggerLabel="Завершить практику"
      />
    </div>
  );
}
