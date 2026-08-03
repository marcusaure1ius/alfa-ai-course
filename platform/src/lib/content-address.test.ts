import { describe, expect, it } from "vitest";

import {
  createContentAddress,
  sanitizeContentAddressInput,
} from "./content-address";

describe("content address", () => {
  it("transliterates a Russian title into a route-safe address", () => {
    expect(createContentAddress("Нейрокурс: быстрый старт с n8n"))
      .toBe("neyrokurs-bystryy-start-s-n8n");
  });

  it("normalizes punctuation, repeated separators, accents and case", () => {
    expect(createContentAddress("  Café & CRM — Урок №1  "))
      .toBe("cafe-crm-urok-1");
  });

  it("keeps a trailing separator while the administrator is typing", () => {
    expect(sanitizeContentAddressInput("Новый раздел "))
      .toBe("novyy-razdel-");
    expect(sanitizeContentAddressInput("my-section-"))
      .toBe("my-section-");
  });

  it("limits the address to the server contract", () => {
    expect(createContentAddress("а".repeat(100))).toHaveLength(80);
  });
});
