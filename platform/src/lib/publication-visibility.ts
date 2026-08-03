export type PublicationStatus = "draft" | "published";

export type SectionVisibility =
  | {
      key: "visible";
      label: "Виден ученикам";
      visible: true;
    }
  | {
      key: "course-hidden";
      label: "Скрыт вместе с курсом";
      visible: false;
    }
  | {
      key: "section-draft";
      label: "Раздел не опубликован";
      visible: false;
    };

export function resolveSectionVisibility(
  courseStatus: PublicationStatus,
  sectionStatus: PublicationStatus,
): SectionVisibility {
  if (sectionStatus === "draft") {
    return {
      key: "section-draft",
      label: "Раздел не опубликован",
      visible: false,
    };
  }

  if (courseStatus === "draft") {
    return {
      key: "course-hidden",
      label: "Скрыт вместе с курсом",
      visible: false,
    };
  }

  return {
    key: "visible",
    label: "Виден ученикам",
    visible: true,
  };
}
