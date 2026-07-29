import "server-only";

export const SESSION_COOKIE_NAME = "course_session";
export const CSRF_COOKIE_NAME = "course_csrf";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const REAUTH_MAX_AGE_SECONDS = 60 * 10;

export function isProductionEnvironment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET должен содержать не менее 32 символов.");
  }
  return secret;
}

export function getAppOrigin(): string {
  const origin = process.env.APP_ORIGIN;
  if (!origin) {
    throw new Error("APP_ORIGIN не настроен.");
  }
  return new URL(origin).origin;
}
