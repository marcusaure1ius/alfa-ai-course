import { afterEach, describe, expect, it } from "vitest";

import { getAppOrigin } from "./config";

const originalAppOrigin = process.env.APP_ORIGIN;
const originalVercelUrl = process.env.VERCEL_URL;

afterEach(() => {
  if (originalAppOrigin === undefined) delete process.env.APP_ORIGIN;
  else process.env.APP_ORIGIN = originalAppOrigin;
  if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
  else process.env.VERCEL_URL = originalVercelUrl;
});

describe("getAppOrigin", () => {
  it("предпочитает явно заданный APP_ORIGIN", () => {
    process.env.APP_ORIGIN = "https://course.example.test/path";
    process.env.VERCEL_URL = "preview.vercel.app";

    expect(getAppOrigin()).toBe("https://course.example.test");
  });

  it("использует deployment URL для динамического preview", () => {
    delete process.env.APP_ORIGIN;
    process.env.VERCEL_URL = "course-preview.vercel.app";

    expect(getAppOrigin()).toBe("https://course-preview.vercel.app");
  });

  it("закрывает доступ без доверенного origin", () => {
    delete process.env.APP_ORIGIN;
    delete process.env.VERCEL_URL;

    expect(() => getAppOrigin()).toThrow("APP_ORIGIN или VERCEL_URL не настроен.");
  });
});
