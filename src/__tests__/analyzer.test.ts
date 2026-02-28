import { describe, it, expect } from "vitest";
import { analyze } from "../analyzer.js";
import type { FunctionDef, FrontendRef } from "../types.js";

function makeDef(
  apiPath: string,
  opts?: { isInternal?: boolean; type?: string }
): FunctionDef {
  return {
    name: apiPath.split(".").pop()!,
    apiPath,
    type: opts?.type ?? "query",
    isInternal: opts?.isInternal ?? false,
    file: `convex/${apiPath.replace(/\./g, "/")}.ts`,
    line: 1,
  };
}

function makeRef(apiPath: string, file?: string): FrontendRef {
  return {
    apiPath,
    file: file ?? `src/App.tsx`,
    line: 1,
  };
}

describe("analyze", () => {
  it("reports MISSING_DEFINITION for refs with no backend def", () => {
    const defs = [makeDef("users.list")];
    const refs = [makeRef("users.list"), makeRef("users.create")];
    const result = analyze(defs, refs);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("MISSING_DEFINITION");
    expect(result.errors[0].apiPath).toBe("users.create");
  });

  it("reports INTERNAL_CALLED_FROM_FRONTEND", () => {
    const defs = [makeDef("admin.cleanup", { isInternal: true })];
    const refs = [makeRef("admin.cleanup")];
    const result = analyze(defs, refs);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toBe("INTERNAL_CALLED_FROM_FRONTEND");
  });

  it("reports UNREFERENCED for public defs with no frontend refs", () => {
    const defs = [makeDef("users.list"), makeDef("users.archive")];
    const refs = [makeRef("users.list")];
    const result = analyze(defs, refs);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].type).toBe("UNREFERENCED");
    expect(result.warnings[0].apiPath).toBe("users.archive");
  });

  it("does not warn about unreferenced internal functions", () => {
    const defs = [
      makeDef("users.list"),
      makeDef("admin.sync", { isInternal: true }),
    ];
    const refs = [makeRef("users.list")];
    const result = analyze(defs, refs);
    expect(result.warnings).toHaveLength(0);
  });

  it("groups multiple locations for same missing path", () => {
    const defs: FunctionDef[] = [];
    const refs = [
      makeRef("users.create", "src/A.tsx"),
      makeRef("users.create", "src/B.tsx"),
    ];
    const result = analyze(defs, refs);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].locations).toHaveLength(2);
  });

  it("returns passed=true when no errors", () => {
    const defs = [makeDef("users.list")];
    const refs = [makeRef("users.list")];
    const result = analyze(defs, refs);
    expect(result.errors).toHaveLength(0);
    expect(result.passed).toBe(true);
  });

  it("returns passed=false when errors exist", () => {
    const defs: FunctionDef[] = [];
    const refs = [makeRef("users.list")];
    const result = analyze(defs, refs);
    expect(result.passed).toBe(false);
  });
});
