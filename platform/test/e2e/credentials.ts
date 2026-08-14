/**
 * Синтетические учётные данные E2E-прогона. Живут только в одноразовой
 * базе course_platform_test_*, создаваемой на каждый запуск, и не являются
 * секретами.
 */
export const E2E_ADMIN = {
  email: "e2e-admin@example.test",
  password: "e2e-admin-not-a-secret-42",
} as const;

export const E2E_STUDENT = {
  email: "e2e-student@example.test",
  password: "e2e-student-not-a-secret-42",
} as const;

export const E2E_COURSE = {
  slug: "e2e-smoke",
  title: "Смоук-курс E2E",
} as const;
