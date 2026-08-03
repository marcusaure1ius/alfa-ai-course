import { describe, expect, it } from "vitest";

import { resolveSectionVisibility } from "./publication-visibility";

describe("resolveSectionVisibility", () => {
  it("shows a section only when both the course and section are published", () => {
    expect(resolveSectionVisibility("published", "published")).toEqual({
      key: "visible",
      label: "Виден ученикам",
      visible: true,
    });
  });

  it("explains that a published section inherits a draft course visibility", () => {
    expect(resolveSectionVisibility("draft", "published")).toEqual({
      key: "course-hidden",
      label: "Скрыт вместе с курсом",
      visible: false,
    });
  });

  it.each(["draft", "published"] as const)(
    "uses the section draft as the primary reason when the course is %s",
    (courseStatus) => {
      expect(resolveSectionVisibility(courseStatus, "draft")).toEqual({
        key: "section-draft",
        label: "Раздел не опубликован",
        visible: false,
      });
    },
  );
});
