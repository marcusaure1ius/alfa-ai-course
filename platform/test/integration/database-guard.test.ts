import { afterEach, describe, expect, it } from "vitest";

import {
  assertDisposableDatabaseUrl,
  assertSafeTestServerUrl,
  buildDisposableDatabaseUrl,
  databaseNameFromUrl,
  DISPOSABLE_DATABASE_PREFIX,
  UnsafeTestDatabaseError,
} from "./database-guard";
import { requireIntegrationDatabaseUrl } from "./database";

const originalIntegrationUrl = process.env.INTEGRATION_TEST_DATABASE_URL;

afterEach(() => {
  if (originalIntegrationUrl === undefined) {
    delete process.env.INTEGRATION_TEST_DATABASE_URL;
  } else {
    process.env.INTEGRATION_TEST_DATABASE_URL = originalIntegrationUrl;
  }
});

describe("assertSafeTestServerUrl", () => {
  it("отклоняет заведомо неизвестный внешний host по классу, а не по списку", () => {
    for (const url of [
      "postgresql://user:pass@db.unknown-host-2c9f.example:5432/anything",
      "postgresql://user:pass@ep-raspberry-1234.eu-central-1.aws.neon.tech/neondb",
      "postgresql://user:pass@203.0.113.7:5432/course_platform",
      "postgresql://user:pass@10.1.2.3:5432/course_platform",
      "postgresql://user:pass@192.168.1.50:5432/course_platform",
    ]) {
      expect(() => assertSafeTestServerUrl(url)).toThrow(
        UnsafeTestDatabaseError,
      );
    }
  });

  it("принимает только loopback-класс адресов", () => {
    for (const url of [
      "postgresql://user:pass@127.0.0.1:55432/course_platform",
      "postgresql://user:pass@127.9.9.9:5432/course_platform",
      "postgresql://user:pass@localhost:5432/course_platform",
      "postgresql://user:pass@[::1]:5432/course_platform",
    ]) {
      expect(() => assertSafeTestServerUrl(url)).not.toThrow();
    }
  });

  it("отклоняет не-PostgreSQL схемы и мусор", () => {
    expect(() =>
      assertSafeTestServerUrl("mysql://user:pass@127.0.0.1:3306/db"),
    ).toThrow(UnsafeTestDatabaseError);
    expect(() => assertSafeTestServerUrl("не url")).toThrow(
      UnsafeTestDatabaseError,
    );
  });
});

describe("assertDisposableDatabaseUrl", () => {
  it("отклоняет произвольную неизвестную базу даже на loopback", () => {
    expect(() =>
      assertDisposableDatabaseUrl(
        "postgresql://user:pass@127.0.0.1:55432/totally_unknown_db_x9",
      ),
    ).toThrow(UnsafeTestDatabaseError);
    expect(() =>
      assertDisposableDatabaseUrl(
        "postgresql://user:pass@127.0.0.1:55432/course_platform",
      ),
    ).toThrow(UnsafeTestDatabaseError);
  });

  it("отклоняет одноразовое имя на внешнем host", () => {
    expect(() =>
      assertDisposableDatabaseUrl(
        `postgresql://user:pass@db.unknown-host-2c9f.example:5432/${DISPOSABLE_DATABASE_PREFIX}abc`,
      ),
    ).toThrow(UnsafeTestDatabaseError);
  });

  it("принимает одноразовую базу bootstrap на loopback", () => {
    expect(() =>
      assertDisposableDatabaseUrl(
        `postgresql://user:pass@127.0.0.1:55432/${DISPOSABLE_DATABASE_PREFIX}0123abcd`,
      ),
    ).not.toThrow();
  });
});

describe("buildDisposableDatabaseUrl", () => {
  it("меняет только имя базы, сохраняя host, порт и credentials", () => {
    const url = buildDisposableDatabaseUrl(
      "postgresql://platform:secret@127.0.0.1:55432/course_platform",
      `${DISPOSABLE_DATABASE_PREFIX}deadbeef`,
    );
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("127.0.0.1");
    expect(parsed.port).toBe("55432");
    expect(parsed.username).toBe("platform");
    expect(databaseNameFromUrl(parsed)).toBe(
      `${DISPOSABLE_DATABASE_PREFIX}deadbeef`,
    );
  });

  it("отказывается строить URL на внешнем сервере", () => {
    expect(() =>
      buildDisposableDatabaseUrl(
        "postgresql://user:pass@db.unknown-host-2c9f.example:5432/x",
        `${DISPOSABLE_DATABASE_PREFIX}abc`,
      ),
    ).toThrow(UnsafeTestDatabaseError);
  });
});

describe("requireIntegrationDatabaseUrl", () => {
  it("fail-closed: без bootstrap переменной тесты не получают URL", () => {
    delete process.env.INTEGRATION_TEST_DATABASE_URL;
    expect(() => requireIntegrationDatabaseUrl()).toThrow(
      /npm run test:integration/,
    );
  });

  it("отклоняет подмену переменной на рабочую базу", () => {
    process.env.INTEGRATION_TEST_DATABASE_URL =
      "postgresql://user:pass@127.0.0.1:55432/course_platform";
    expect(() => requireIntegrationDatabaseUrl()).toThrow(
      UnsafeTestDatabaseError,
    );
    process.env.INTEGRATION_TEST_DATABASE_URL =
      `postgresql://user:pass@db.unknown-host-2c9f.example:5432/${DISPOSABLE_DATABASE_PREFIX}abc`;
    expect(() => requireIntegrationDatabaseUrl()).toThrow(
      UnsafeTestDatabaseError,
    );
  });

  it("возвращает URL одноразовой базы, созданной bootstrap", () => {
    const url = `postgresql://user:pass@127.0.0.1:55432/${DISPOSABLE_DATABASE_PREFIX}abc`;
    process.env.INTEGRATION_TEST_DATABASE_URL = url;
    expect(requireIntegrationDatabaseUrl()).toBe(url);
  });
});
