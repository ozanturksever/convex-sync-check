import { describe, it, expect } from "vitest";
import { loadConfig } from "../config.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("loadConfig", () => {
  it("returns empty config when no file exists", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-test-"));
    const result = loadConfig(dir);
    expect(result).toEqual({});
  });

  it("loads .convex-sync-check.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-test-"));
    writeFileSync(
      join(dir, ".convex-sync-check.json"),
      JSON.stringify({
        convexDir: "packages/backend/convex",
        frontendDirs: ["apps/web/src"],
        functionWrappers: { authedQuery: "public" },
      })
    );
    const result = loadConfig(dir);
    expect(result.convexDir).toBe("packages/backend/convex");
    expect(result.functionWrappers?.authedQuery).toBe("public");
  });

  it("loads from custom path", () => {
    const dir = mkdtempSync(join(tmpdir(), "config-test-"));
    writeFileSync(
      join(dir, "custom.json"),
      JSON.stringify({ convexDir: "custom/convex" })
    );
    const result = loadConfig(dir, join(dir, "custom.json"));
    expect(result.convexDir).toBe("custom/convex");
  });
});
