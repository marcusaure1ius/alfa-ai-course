import { describe, expect, it } from "vitest";

import {
  getN8nAccessDateDefaults,
  getN8nStudentAccessLicenseGate,
} from "./student-access";

describe("n8n student access license gate", () => {
  it("закрыт по умолчанию", () => {
    expect(getN8nStudentAccessLicenseGate({})).toMatchObject({ ready: false });
  });

  it("принимает только разрешённый mode и bounded evidence reference", () => {
    expect(
      getN8nStudentAccessLicenseGate({
        N8N_STUDENT_ACCESS_LICENSE_MODE: "written_permission",
        N8N_STUDENT_ACCESS_LICENSE_EVIDENCE: "agreement:n8n-2026-08-01",
      }),
    ).toEqual({
      ready: true,
      mode: "written_permission",
      evidenceReference: "agreement:n8n-2026-08-01",
    });
    expect(
      getN8nStudentAccessLicenseGate({
        N8N_STUDENT_ACCESS_LICENSE_MODE: "approved",
        N8N_STUDENT_ACCESS_LICENSE_EVIDENCE: "trust me",
      }),
    ).toMatchObject({ ready: false });
  });

  it("задаёт явное окно срока доступа", () => {
    expect(
      getN8nAccessDateDefaults(new Date("2026-07-31T12:00:00.000Z")),
    ).toEqual({
      minimum: "2026-08-01",
      recommended: "2026-08-30",
      maximum: "2027-07-31",
    });
  });
});
