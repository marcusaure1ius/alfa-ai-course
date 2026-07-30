import type {
  StudentCourse,
  StudentMaterialSummary,
} from "@/server/course/contracts";

export type StudentCourseProgress = {
  completed: number;
  total: number;
  percent: number;
  current: StudentMaterialSummary | null;
  previous: StudentMaterialSummary | null;
  next: StudentMaterialSummary | null;
};

export function flattenMaterials(course: StudentCourse): StudentMaterialSummary[] {
  return course.sections.flatMap((section) => section.materials);
}

export function getCourseProgress(course: StudentCourse): StudentCourseProgress {
  const materials = flattenMaterials(course);
  const completed = materials.filter((material) => material.completedAt).length;
  const current =
    materials.find((material) => !material.completedAt) ??
    materials.at(-1) ??
    null;
  const currentIndex = current ? materials.findIndex((item) => item.id === current.id) : -1;
  return {
    completed,
    total: materials.length,
    percent: materials.length === 0 ? 0 : Math.round((completed / materials.length) * 100),
    current,
    previous: currentIndex > 0 ? materials[currentIndex - 1] ?? null : null,
    next:
      currentIndex >= 0 && currentIndex < materials.length - 1
        ? materials[currentIndex + 1] ?? null
        : null,
  };
}

export function displayStudentName(email: string): string {
  const local = email.split("@")[0]?.trim();
  return local || "Ученик";
}

export function studentInitial(email: string): string {
  return displayStudentName(email).slice(0, 1).toLocaleUpperCase("ru");
}
