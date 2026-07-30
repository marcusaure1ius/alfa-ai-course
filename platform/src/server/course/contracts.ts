export const COURSE_API_VERSION = "course-v1" as const;

export type PublicationStatus = "draft" | "published";
export type MaterialKind = "article" | "practice";

export type StudentMaterialSummary = {
  id: string;
  slug: string;
  kind: MaterialKind;
  title: string;
  summary: string;
  position: number;
  estimatedMinutes: number | null;
  completedAt: string | null;
};

export type StudentCourse = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sections: Array<{
    id: string;
    slug: string;
    title: string;
    position: number;
    materials: StudentMaterialSummary[];
  }>;
};

export type StudentMaterial = StudentMaterialSummary & {
  course: { id: string; slug: string; title: string };
  section: { id: string; slug: string; title: string };
  bodyMarkdown: string;
  lastPosition: string | null;
};
