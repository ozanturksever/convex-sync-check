import { describe, it, expect } from "vitest";
import { parseCliArgs } from "../cli.js";

describe("parseCliArgs", () => {
  it("parses --json flag", () => {
    const result = parseCliArgs(["--json"]);
    expect(result.json).toBe(true);
  });

  it("parses --convex-dir", () => {
    const result = parseCliArgs(["--convex-dir", "packages/convex"]);
    expect(result.convexDir).toBe("packages/convex");
  });

  it("parses --frontend-dir", () => {
    const result = parseCliArgs(["--frontend-dir", "apps/web/src"]);
    expect(result.frontendDir).toBe("apps/web/src");
  });

  it("parses --deployed flag", () => {
    const result = parseCliArgs(["--deployed"]);
    expect(result.deployed).toBe(true);
  });

  it("parses --no-warnings flag", () => {
    const result = parseCliArgs(["--no-warnings"]);
    expect(result.noWarnings).toBe(true);
  });

  it("parses --verbose flag", () => {
    const result = parseCliArgs(["--verbose"]);
    expect(result.verbose).toBe(true);
  });

  it("returns defaults when no args", () => {
    const result = parseCliArgs([]);
    expect(result.json).toBe(false);
    expect(result.deployed).toBe(false);
    expect(result.verbose).toBe(false);
  });
});
