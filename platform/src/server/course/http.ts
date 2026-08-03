import { CourseContentError } from "./repository";
import { UnsafeCourseContentError } from "./content-safety";
import type { MaterialKind, PublicationStatus } from "./contracts";

export function courseError(
  status: number,
  code: string,
  message: string,
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { "cache-control": "no-store" } },
  );
}

export function hasExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function isSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 2 &&
    value.length <= 80 &&
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)
  );
}

export function isBoundedText(
  value: unknown,
  minimum: number,
  maximum: number,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length >= minimum &&
    value.length <= maximum
  );
}

export function courseRepositoryError(error: unknown): Response | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    "constraint_name" in error &&
    typeof error.constraint_name === "string" &&
    error.constraint_name.includes("slug")
  ) {
    return courseError(409, "ADDRESS_CONFLICT", "Этот адрес уже используется.");
  }
  if (error instanceof UnsafeCourseContentError) {
    return courseError(
      400,
      error.code,
      "Материал содержит неподдерживаемый HTML, протокол или вложение.",
    );
  }
  if (error instanceof CourseContentError) {
    const status =
      error.code === "FORBIDDEN"
        ? 403
        : error.code === "NOT_FOUND"
          ? 404
          : 409;
    const message =
      error.code === "NOT_FOUND"
        ? "Объект не найден."
        : error.code === "CONFIRMATION_MISMATCH"
          ? "Введите точное название курса."
        : error.code === "SECTION_NOT_EMPTY"
          ? "Сначала перенесите или удалите материалы раздела."
          : "Операцию нельзя выполнить с выбранными данными.";
    return courseError(
      status,
      error.code,
      message,
    );
  }
  return null;
}

export function noStoreJson(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export type MaterialInput = {
  sectionId: string;
  slug: string;
  kind: MaterialKind;
  title: string;
  summary: string;
  bodyMarkdown: string;
  position: number;
  estimatedMinutes: number | null;
  status: PublicationStatus;
};

export function isMaterialInput(
  body: Record<string, unknown> | null,
): body is MaterialInput {
  return Boolean(
    body &&
      hasExactKeys(body, [
        "sectionId",
        "slug",
        "kind",
        "title",
        "summary",
        "bodyMarkdown",
        "position",
        "estimatedMinutes",
        "status",
      ]) &&
      typeof body.sectionId === "string" &&
      isSlug(body.slug) &&
      (body.kind === "article" || body.kind === "practice") &&
      isBoundedText(body.title, 2, 160) &&
      isBoundedText(body.summary, 0, 500) &&
      isBoundedText(body.bodyMarkdown, 0, 200_000) &&
      Number.isSafeInteger(body.position) &&
      (body.position as number) >= 0 &&
      (body.estimatedMinutes === null ||
        (Number.isSafeInteger(body.estimatedMinutes) &&
          (body.estimatedMinutes as number) > 0 &&
          (body.estimatedMinutes as number) <= 1440)) &&
      (body.status === "draft" || body.status === "published"),
  );
}
