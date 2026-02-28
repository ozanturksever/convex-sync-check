import { describe, it, expect } from "vitest";
import { formatHuman } from "../human.js";
import { formatJson } from "../json.js";
import type { CheckResult } from "../../types.js";

const baseResult: CheckResult = {
  project: "my-app",
  convexDir: "convex/",
  frontendDirs: ["src/"],
  stats: {
    definedFunctions: 10,
    publicFunctions: 8,
    internalFunctions: 2,
    frontendRefs: 5,
    backendModules: 3,
  },
  errors: [],
  warnings: [],
  passed: true,
};

describe("formatHuman", () => {
  it("shows PASS when no errors", () => {
    const output = formatHuman(baseResult);
    expect(output).toContain("PASS");
    expect(output).toContain("my-app");
  });

  it("shows FAIL with missing definitions", () => {
    const result: CheckResult = {
      ...baseResult,
      passed: false,
      errors: [
        {
          type: "MISSING_DEFINITION",
          apiPath: "users.create",
          locations: [{ file: "src/App.tsx", line: 33 }],
        },
      ],
    };
    const output = formatHuman(result);
    expect(output).toContain("FAIL");
    expect(output).toContain("api.users.create");
    expect(output).toContain("src/App.tsx:33");
  });

  it("shows internal function leak errors", () => {
    const result: CheckResult = {
      ...baseResult,
      passed: false,
      errors: [
        {
          type: "INTERNAL_CALLED_FROM_FRONTEND",
          apiPath: "admin.cleanup",
          locations: [{ file: "src/Admin.tsx", line: 10 }],
        },
      ],
    };
    const output = formatHuman(result);
    expect(output).toContain("FAIL");
    expect(output).toContain("api.admin.cleanup");
    expect(output).toContain("internal");
  });

  it("shows unreferenced warnings", () => {
    const result: CheckResult = {
      ...baseResult,
      warnings: [
        {
          type: "UNREFERENCED",
          apiPath: "users.archive",
          definition: { type: "mutation", file: "convex/users.ts", line: 20 },
        },
      ],
    };
    const output = formatHuman(result);
    expect(output).toContain("api.users.archive");
  });
});

describe("formatJson", () => {
  it("returns valid JSON matching CheckResult shape", () => {
    const output = formatJson(baseResult);
    const parsed = JSON.parse(output);
    expect(parsed.project).toBe("my-app");
    expect(parsed.passed).toBe(true);
    expect(parsed.errors).toEqual([]);
  });
});
